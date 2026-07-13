/**
 * PairBudget - Entry Point
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {initNotificationListener} from './src/services/NotificationService';
import notifee, { EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Register the headless task for background notification listening
// This is handled by NotificationService to avoid duplicate registration
// and ensure consistent AsyncStorage key usage.
initNotificationListener();

// notifee 백그라운드 이벤트 핸들러 (알림 탭 시 앱 열기)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    // 앱이 백그라운드에 있을 때 알림을 누르면 AsyncStorage에 플래그를 저장하여 AppState가 active가 될 때 이동하도록 함
    await AsyncStorage.setItem('pending_notification_nav', 'true');
    if (detail?.notification?.id) {
      await notifee.cancelNotification(detail.notification.id);
    }
  }
});

// Register the main app component
AppRegistry.registerComponent(appName, () => App);
