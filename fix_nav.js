const fs = require('fs');

const path = 'D:/SideProjects/PairBudget/src/navigation/AppNavigator.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('import { AppState ')) {
  content = content.replace('import { StyleSheet, View, ActivityIndicator, Text } from \'react-native\';', 'import { StyleSheet, View, ActivityIndicator, Text, AppState } from \'react-native\';');
}

if (!content.includes('import AsyncStorage')) {
  content = content.replace('import notifee, { EventType } from \'@notifee/react-native\';', 'import notifee, { EventType } from \'@notifee/react-native\';\nimport AsyncStorage from \'@react-native-async-storage/async-storage\';');
}

// Add AppState listener inside AppNavigator component
const appStateEffect = `
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        try {
          const pendingNav = await AsyncStorage.getItem('pending_notification_nav');
          if (pendingNav === 'true') {
            await AsyncStorage.removeItem('pending_notification_nav');
            navigateToPending();
          }
        } catch (e) {
          console.log(e);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
`;

if (!content.includes('AppState.addEventListener')) {
  // insert before the onForegroundEvent useEffect
  content = content.replace('// 1) 백그라운드 앱이 열려있을 때', appStateEffect + '\n  // 1) 백그라운드 앱이 열려있을 때');
}

fs.writeFileSync(path, content, 'utf8');

// Now update index.js to set this flag
const indexPath = 'D:/SideProjects/PairBudget/index.js';
let indexContent = fs.readFileSync(indexPath, 'utf8');

if (!indexContent.includes('import AsyncStorage')) {
  indexContent = indexContent.replace('import notifee, { EventType } from \'@notifee/react-native\';', 'import notifee, { EventType } from \'@notifee/react-native\';\nimport AsyncStorage from \'@react-native-async-storage/async-storage\';');
}

const newHandler = `notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    // 앱이 백그라운드에 있을 때 알림을 누르면 AsyncStorage에 플래그를 저장하여 AppState가 active가 될 때 이동하도록 함
    await AsyncStorage.setItem('pending_notification_nav', 'true');
    if (detail?.notification?.id) {
      await notifee.cancelNotification(detail.notification.id);
    }
  }
});`;

indexContent = indexContent.replace(/notifee\.onBackgroundEvent\(async \(\{ type, detail \}\) => \{[\s\S]*?\}\);/, newHandler);
fs.writeFileSync(indexPath, indexContent, 'utf8');

console.log('Successfully updated navigation logic');
