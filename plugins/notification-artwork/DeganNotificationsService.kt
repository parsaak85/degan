package __PACKAGE__

import android.content.Context
import android.graphics.Bitmap
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.service.interfaces.PresentationDelegate

// Keep Expo's scheduling, reboot restoration, sound, tap actions and permission handling.
// Only replace the visible content of the Thursday meal reminder with the bundled image.
class DeganNotificationsService : NotificationsService() {
  override fun getPresentationDelegate(context: Context): PresentationDelegate =
    ArtworkPresentationDelegate(context)
}

private class ArtworkPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
  override suspend fun createNotification(
    notification: Notification,
    notificationBehavior: NotificationBehaviorRecord?
  ): android.app.Notification {
    val standard = super.createNotification(notification, notificationBehavior)
    val kind = notification.notificationRequest.content.body?.optString("kind")
    if (kind != "thursday" && kind != "test") return standard

    val compact = RemoteViews(context.packageName, R.layout.degan_notification_compact)
    val expanded = RemoteViews(context.packageName, R.layout.degan_notification_expanded)
    return NotificationCompat.Builder(context, standard)
      .setLargeIcon(null as Bitmap?)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(compact)
      .setCustomBigContentView(expanded)
      .setCustomHeadsUpContentView(compact)
      .build()
  }
}

