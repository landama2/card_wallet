import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import { Item, reminderTime } from './logic';
import { listItems, setNotifyId } from './db';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
  }),
});

export const DAY = 86_400_000;
export const getLead = () => Number(Storage.getItemSync('lead_ms') ?? DAY);
let queue: Promise<void> = Promise.resolve();
export const setLead = (ms: number) => {
  Storage.setItemSync('lead_ms', String(ms));
  queue = queue.then(rescheduleAll).catch(() => {});
};

export async function schedule(item: Item) {
  if (item.kind !== 'ticket' || item.expires_at == null) return;
  const t = reminderTime(item.expires_at, getLead(), Date.now());
  if (t == null) return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT,
  });
  if (!(await Notifications.requestPermissionsAsync()).granted) return;
  const nid = await Notifications.scheduleNotificationAsync({
    content: { title: 'Ticket expiring soon', body: item.name },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(t), channelId: 'default' },
  });
  setNotifyId(item.id, nid);
}

export async function cancel(item: Item) {
  if (item.notify_id) await Notifications.cancelScheduledNotificationAsync(item.notify_id);
}

export async function rescheduleAll() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const i of listItems()) {
    setNotifyId(i.id, null);
    await schedule({ ...i, notify_id: null });
  }
}
