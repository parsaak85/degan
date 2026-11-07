package expo.modules.degandevice

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.app.AlarmManager
import android.os.Build
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.core.content.ContextCompat
import expo.modules.kotlin.functions.Queues
import org.json.JSONObject
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.util.UUID

class DeganDeviceModule : Module() {
  private var handoff: ServerSocket? = null

  override fun definition() = ModuleDefinition {
    Name("DeganDevice")
    AsyncFunction("startHunt") { raw: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("No app context")
      check(NotificationManagerCompat.from(context).areNotificationsEnabled()) { "مجوز اعلان شکار را فعال کنید." }
      check(DeganHuntService.instance == null && DeganHuntService.prepared == null) { "شکار دیگری در حال اجراست." }
      fun findWeb(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) findWeb(view.getChildAt(i))?.let { return it }
        return null
      }
      val root = appContext.currentActivity?.window?.decorView ?: throw IllegalStateException("App must be visible")
      val view = findWeb(root) ?: throw IllegalStateException("صفحه سایت آماده نیست.")
      check(Uri.parse(view.url.orEmpty()).host == "food.guilan.ac.ir") { "صفحه سایت آماده نیست." }
      val config = JSONObject(raw)
      check(config.getJSONArray("foods").length() > 0)
      DeganHuntService.state = JSONObject().put("phase", "watching").put("checks", 0)
      DeganHuntService.prepared = Pair(view, config)
      try { ContextCompat.startForegroundService(context, Intent(context, DeganHuntService::class.java)) }
      catch (error: Exception) { DeganHuntService.prepared = null; throw error }
      true
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("stopHunt") {
      DeganHuntService.prepared = null
      DeganHuntService.instance?.finish("stopped", "شکار متوقف شد.")
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("huntState") { DeganHuntService.snapshot() }.runOnQueue(Queues.MAIN)
    AsyncFunction("reminderStatus") {
      val context = appContext.reactContext ?: throw IllegalStateException("No app context")
      val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      mapOf("notifications" to NotificationManagerCompat.from(context).areNotificationsEnabled(),
        "exact" to (Build.VERSION.SDK_INT < 31 || alarm.canScheduleExactAlarms()))
    }
    AsyncFunction("openReminderSettings") {
      val context = appContext.reactContext ?: throw IllegalStateException("No app context")
      val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val intent = if (!NotificationManagerCompat.from(context).areNotificationsEnabled())
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      else if (Build.VERSION.SDK_INT >= 31 && !alarm.canScheduleExactAlarms())
        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
      else Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AsyncFunction("isVpnActive") {
      val context = appContext.reactContext ?: throw IllegalStateException("No app context")
      val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      manager.allNetworks.any { network ->
        manager.getNetworkCapabilities(network)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
      }
    }
    AsyncFunction("openPaymentForm") { action: String, fields: List<Map<String, String>> ->
      val context = appContext.reactContext ?: throw IllegalStateException("No app context")
      val uri = Uri.parse(action)
      require((uri.scheme == "https" || (uri.scheme == "http" && uri.host == "food.guilan.ac.ir")) && !uri.host.isNullOrBlank() && uri.userInfo == null) { "Invalid payment destination" }
      require(!action.contains('\r') && !action.contains('\n') && uri.host!!.matches(Regex("[A-Za-z0-9.-]+"))) { "Invalid payment host" }
      require(fields.size <= 100 && fields.sumOf { (it["name"]?.length ?: 0) + (it["value"]?.length ?: 0) } <= 65536) { "Payment form too large" }
      fun escape(value: String) = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
      val inputs = fields.joinToString("") { "<input type=\"hidden\" name=\"${escape(it["name"] ?: "")}\" value=\"${escape(it["value"] ?: "")}\">" }
      val nonce = UUID.randomUUID().toString()
      val html = """<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>درگاه پرداخت</title><body><p>در حال انتقال به درگاه پرداخت…</p><form id="payment" method="post" action="${escape(action)}">$inputs<button type="submit">ادامه به درگاه پرداخت</button></form><script nonce="$nonce">HTMLFormElement.prototype.submit.call(document.getElementById('payment'))</script></body></html>"""
      val body = html.toByteArray(Charsets.UTF_8)
      handoff?.close()
      // ACTION_VIEW cannot carry a POST body. A short-lived random loopback URL
      // preserves the final bank form; allow a few reads for browser prefetch/
      // reload, without consuming its only response before the visible tab loads.
      val server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
      server.soTimeout = 120000
      handoff = server
      val path = "/${UUID.randomUUID()}"
      Thread {
        val deadline = System.currentTimeMillis() + 120000
        var reads = 0
        try {
          while (!server.isClosed && System.currentTimeMillis() < deadline && reads < 4) {
            server.soTimeout = maxOf(1, (deadline - System.currentTimeMillis()).toInt())
            server.accept().use { socket ->
              socket.soTimeout = 3000
              val reader = socket.getInputStream().bufferedReader()
              val request = reader.readLine().orEmpty()
              var headerBytes = 0
              while (true) {
                val line = reader.readLine() ?: break
                if (line.isEmpty()) break
                headerBytes += line.length
                require(headerBytes < 16384) { "Request headers too large" }
              }
              val valid = request.startsWith("GET $path ") && System.currentTimeMillis() < deadline
              val output = socket.getOutputStream()
              if (valid) {
                // Bank processors can redirect across HTTPS bank hosts. A CSP
                // pinned to the first host can block that valid redirect chain.
                val header = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; script-src 'nonce-$nonce'; form-action https: http://food.guilan.ac.ir; base-uri 'none'; frame-ancestors 'none'\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n"
                output.write(header.toByteArray(Charsets.UTF_8)); output.write(body); output.flush()
                reads++
              } else {
                output.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
              }
            }
          }
        } catch (_: SocketTimeoutException) { } catch (_: Exception) { }
        finally { try { server.close() } catch (_: Exception) { } }
      }.apply { isDaemon = true; name = "DeganPaymentHandoff"; start() }
      try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("http://127.0.0.1:${server.localPort}$path")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (error: Exception) { server.close(); throw error }
    }
    OnDestroy { handoff?.close(); handoff = null }
  }
}

