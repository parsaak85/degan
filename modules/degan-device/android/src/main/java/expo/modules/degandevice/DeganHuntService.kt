package expo.modules.degandevice

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.*
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

/** Owns the timer and website messages while React's JS thread is suspended.
 * Reuses the displayed legacy WebView; no cookie copying, API purchases or retry writes.
 * Deliberately NOT sticky: a killed process cannot safely retry an ambiguous purchase.
 */
class DeganHuntService : Service() {
  companion object {
    private const val PROGRESS = 4101
    private const val RESULT = 4102
    var prepared: Pair<WebView, JSONObject>? = null
    var instance: DeganHuntService? = null
    var state = JSONObject().put("phase", "idle")
    fun snapshot(): String = state.toString()
  }
  private val handler = Handler(Looper.getMainLooper())
  private var web: WebView? = null
  private var config = JSONObject()
  private val nonce = UUID.randomUUID().toString()
  private var wake: PowerManager.WakeLock? = null
  private var finished = false
  private var count = 0
  private var processedPage = ""
  private var submittedAt = 0L
  private var startedAt = 0L
  private var lastSnapshot = 0L
  private var nextReload = 0L
  private var confirmationRead = false
  private var lastNotice = 0L
  private var weekDeadline = 0L
  private val tick = object : Runnable {
    override fun run() {
      if (finished) return
      val now = System.currentTimeMillis()
      if (now - startedAt > 5 * 60 * 60 * 1000L) { finish("error", "زمان شکار تمام شد؛ برای ادامه دوباره شروع کنید."); return }
      if (submittedAt > 0 && now - submittedAt > 30000) { finish("error", "نتیجه خرید مشخص نشد؛ رزروها را بررسی کنید. خرید دوباره انجام نشد."); return }
      if (now - lastSnapshot > 60000) { finish("error", "پاسخ سایت دریافت نشد؛ اتصال و رزروها را بررسی کنید."); return }
      val view = web ?: return finish("error", "صفحه سایت بسته شد.")
      if (!view.isAttachedToWindow) { finish("error", "صفحه سایت بسته شد؛ شکار متوقف شد."); return }
      val uri = Uri.parse(view.url.orEmpty())
      if (uri.host != "food.guilan.ac.ir" || uri.scheme !in listOf("http", "https")) {
        finish("error", "صفحه سایت تغییر کرد؛ شکار متوقف شد."); return
      }
      if (nextReload > 0 && now >= nextReload && submittedAt == 0L) {
        nextReload = 0; count++; publish("watching", "در حال تازه‌سازی سایت")
        view.reload()
      }
      // An explicit read-only panel load after submission confirms persisted state.
      if (submittedAt > 0 && !confirmationRead && now - submittedAt >= 8000 && view.progress == 100) {
        confirmationRead = true; view.loadUrl(config.getString("panelUrl"))
      } else if (view.progress == 100) {
        val hook = """(function(){
          if(location.hostname!=='food.guilan.ac.ir'||window.top!==window)return;
          if(!window.__deganNativePost){
            var original=window.ReactNativeWebView&&window.ReactNativeWebView.postMessage;
            if(!original)return;
            window.__deganNativePost=original;
            window.ReactNativeWebView.postMessage=function(value){
              try{DeganHuntNative.message(${JSONObject.quote(nonce)},String(value));}catch(e){}
            };
          }
        })();"""
        view.evaluateJavascript(hook + config.optString("before") + config.optString("bridge"), null)
      }
      handler.postDelayed(this, 750)
    }
  }
  override fun onBind(intent: Intent?) = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == "stop") { finish("stopped", "شکار متوقف شد."); return START_NOT_STICKY }
    if (instance === this) return START_NOT_STICKY
    val ready = prepared; prepared = null
    if (ready == null) { stopSelf(); return START_NOT_STICKY }
    instance = this; web = ready.first; config = ready.second
    startedAt = System.currentTimeMillis(); lastSnapshot = startedAt
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel("hunt-progress", "فرایند شکار غذا", NotificationManager.IMPORTANCE_LOW))
    manager.createNotificationChannel(NotificationChannel("hunt-result", "نتیجه شکار غذا", NotificationManager.IMPORTANCE_HIGH).apply { enableVibration(true) })
    try {
      val notification = notification("در حال بررسی موجودی غذا")
      if (Build.VERSION.SDK_INT >= 29) startForeground(PROGRESS, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      else startForeground(PROGRESS, notification)
      wake = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "degan:hunt").apply { acquire(5 * 60 * 60 * 1000L) }
      web!!.addJavascriptInterface(object {
        @JavascriptInterface fun message(token: String, raw: String) {
          if (token != nonce || raw.length > 500000) return
          handler.post { if (!finished) try { receive(JSONObject(raw)) } catch (_: Exception) { finish("error", "پاسخ سایت قابل بررسی نبود.") } }
        }
      }, "DeganHuntNative")
      // addJavascriptInterface becomes visible after the next document load.
      count++; publish("watching", "در حال بررسی موجودی غذا"); web!!.reload()
      handler.postDelayed(tick, 750)
    } catch (_: Exception) { finish("error", "سرویس شکار شروع نشد؛ مجوز اعلان را بررسی کنید.") }
    return START_NOT_STICKY
  }
  private fun receive(message: JSONObject) {
    val type = message.optString("type")
    if (type == "snapshot" && message.optString("scope") == "degan-site-v2") {
      val snapshot = message.getJSONObject("snapshot")
      if (snapshot.optString("kind") == "login") { finish("error", "نشست سایت تمام شد؛ دوباره وارد شوید."); return }
      if (snapshot.optString("kind") != "panel") return
      lastSnapshot = System.currentTimeMillis()
      if (snapshot.optString("weekStart") != config.getString("start")) {
        // Reloads can restore the server's default week. Use its guarded actual
        // arrows to restore the selected week; never reuse another week's index.
        if (weekDeadline == 0L) weekDeadline = System.currentTimeMillis() + 20000
        if (System.currentTimeMillis() >= weekDeadline) {
          finish("error", "هفته موردنظر در سایت آماده نشد؛ صفحه و رزروها را بررسی کنید."); return
        }
        web?.evaluateJavascript(config.getString("week"), null); return
      }
      weekDeadline = 0L
      if (snapshot.optBoolean("navigating")) return
      val rows = snapshot.optJSONArray("foods") ?: return
      val selected = config.getJSONArray("foods")
      val candidates = JSONArray()
      val allRows = (0 until rows.length()).map { rows.getJSONObject(it) }
      for (i in 0 until selected.length()) {
        val target = selected.getJSONObject(i)
        val row = allRows.find { it.optString("key") == target.optString("key") && it.optString("date") == target.optString("date") && it.optString("programId") == target.optString("programId") } ?: continue
        if (row.optBoolean("reserved") && !snapshot.optBoolean("dirty") && !snapshot.optBoolean("pending")) {
          state.put("winner", row)
          finish("done", "رزرو ${row.optString("name")} در سایت تأیید شد."); return
        }
        if (!expired(row.optString("date")) && !row.optBoolean("reserved") && !row.optBoolean("reportOnly") && !row.optBoolean("consumed") && row.optJSONObject("actions")?.opt("buy") == false && allRows.none { it.optString("date") == row.optString("date") && it.optBoolean("reserved") }) candidates.put(row)
      }
      if (submittedAt > 0) return
      if (candidates.length() == 0) { finish("error", "غذای قابل شکار از انتخاب‌ها باقی نمانده است."); return }
      val page = snapshot.optString("pageId")
      if (page == processedPage || nextReload > 0) return
      if (snapshot.optBoolean("dirty") || snapshot.optBoolean("pending") || snapshot.optBoolean("dialog")) { finish("error", "صفحه سایت تغییر ذخیره‌نشده دارد؛ آن را بررسی کنید."); return }
      processedPage = page
      val indices = JSONArray()
      for (i in 0 until candidates.length()) indices.put(candidates.getJSONObject(i).getInt("index"))
      val script = config.getString("hunt").replace("__DEGAN_INDICES__", indices.toString()).replace("__DEGAN_TARGETS__", candidates.toString())
      web?.evaluateJavascript(script, null)
    } else when (type) {
      "hunt-submitted", "bought" -> if (submittedAt == 0L) {
        submittedAt = System.currentTimeMillis(); nextReload = 0
        publish("verifying", "غذا پیدا شد؛ در حال تأیید ثبت خرید")
      }
      "miss" -> if (submittedAt == 0L && nextReload == 0L) nextReload = System.currentTimeMillis() + 1000
      "hunt-expired", "session-lost", "day-reserved", "target-changed" -> finish("error", "وضعیت غذا یا نشست سایت تغییر کرد؛ دوباره بررسی کنید.")
    }
  }
  private fun expired(date: String): Boolean {
    if (!date.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) return true
    val zone = TimeZone.getTimeZone("Asia/Tehran")
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = zone }.format(Date())
    return date < today || (date == today && Calendar.getInstance(zone).get(Calendar.HOUR_OF_DAY) >= 15)
  }
  private fun launchIntent(): PendingIntent? = packageManager.getLaunchIntentForPackage(packageName)?.let {
    PendingIntent.getActivity(this, 0, it.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }
  private fun notification(text: String): Notification {
    val stop = PendingIntent.getService(this, 1, Intent(this, DeganHuntService::class.java).setAction("stop"), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val names = config.optJSONArray("foods")?.let { rows -> (0 until rows.length()).joinToString("، ") { rows.getJSONObject(it).optString("name") } }.orEmpty()
    return NotificationCompat.Builder(this, "hunt-progress").setSmallIcon(android.R.drawable.ic_menu_search)
      .setContentTitle("شکار غذا · $count بررسی").setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText("$text\n$names"))
      .setContentIntent(launchIntent()).setOngoing(true).setOnlyAlertOnce(true)
      .addAction(android.R.drawable.ic_media_pause, "توقف شکار", stop).build()
  }
  private fun publish(phase: String, message: String) {
    state.put("phase", phase).put("checks", count).put("message", message)
    if (System.currentTimeMillis() - lastNotice > 1500 || phase == "verifying") {
      lastNotice = System.currentTimeMillis()
      try { NotificationManagerCompat.from(this).notify(PROGRESS, notification(message)) } catch (_: SecurityException) { }
    }
  }
  fun finish(phase: String, message: String) {
    if (finished) return
    finished = true; state.put("phase", phase).put("checks", count).put("message", message)
    handler.removeCallbacksAndMessages(null)
    // The React-owned view may already have been destroyed. Resource release
    // and stopForeground must still run in that case.
    runCatching {
      web?.evaluateJavascript(config.optString("stop"), null)
      web?.removeJavascriptInterface("DeganHuntNative")
      web?.evaluateJavascript("if(window.__deganNativePost){window.ReactNativeWebView.postMessage=window.__deganNativePost;delete window.__deganNativePost;}true;", null)
    }
    if (wake?.isHeld == true) wake?.release()
    stopForeground(STOP_FOREGROUND_REMOVE)
    if (phase != "stopped") try {
      NotificationManagerCompat.from(this).notify(RESULT, NotificationCompat.Builder(this, "hunt-result")
        .setSmallIcon(android.R.drawable.ic_menu_search).setContentTitle(if (phase == "done") "غذا رزرو شد" else "شکار متوقف شد")
        .setContentText(message).setStyle(NotificationCompat.BigTextStyle().bigText(message))
        .setContentIntent(launchIntent()).setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_HIGH).build())
    } catch (_: SecurityException) { }
    web = null; instance = null; stopSelf()
  }
  override fun onTimeout(startId: Int, fgsType: Int) { finish("error", "محدودیت زمان پس‌زمینه اندروید رسید؛ شکار متوقف شد.") }
  override fun onDestroy() { if (!finished) finish("error", "سرویس شکار بسته شد؛ رزروها را بررسی کنید."); super.onDestroy() }
}
