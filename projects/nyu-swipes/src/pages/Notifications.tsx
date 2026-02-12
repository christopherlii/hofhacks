import { motion } from 'framer-motion';
import { Bell, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store';

export function NotificationsPage() {
  const notifications = useStore((state) => state.notifications);
  const markNotificationRead = useStore((state) => state.markNotificationRead);
  const markAllNotificationsRead = useStore((state) => state.markAllNotificationsRead);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <motion.h1 
          className="text-2xl font-semibold tracking-tight"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Notifications
        </motion.h1>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllNotificationsRead}>
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-12 h-12 bg-muted flex items-center justify-center mx-auto mb-4">
              <Bell className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No notifications yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification, index) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card 
                className={`cursor-pointer transition-colors ${!notification.read ? 'bg-violet-50 border-violet-200' : ''}`}
                onClick={() => markNotificationRead(notification.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 ${notification.read ? 'bg-transparent' : 'bg-violet-600'}`} />
                    <div className="flex-1">
                      <p className="font-medium">{notification.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{notification.message}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {new Date(notification.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
