const fs = require('fs');

const path = 'D:/SideProjects/PairBudget/src/navigation/AppNavigator.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('import { AppState ')) {
  content = content.replace(/import \{.*?\} from 'react-native';/, 'import { StyleSheet, View, ActivityIndicator, Text, AppState } from \'react-native\';');
}

if (!content.includes('import AsyncStorage')) {
  content = content.replace(/import notifee, \{ EventType \} from '@notifee\/react-native';/, 'import notifee, { EventType } from \'@notifee/react-native\';\nimport AsyncStorage from \'@react-native-async-storage/async-storage\';');
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
  const target = 'useEffect(() => {\n    return notifee.onForegroundEvent';
  content = content.replace(target, appStateEffect + '\n  ' + target);
}

fs.writeFileSync(path, content, 'utf8');
console.log('AppNavigator.tsx updated.');
