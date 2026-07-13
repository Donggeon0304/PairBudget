/**
 * PairBudget - 커플 공유 가계부 앱
 * React Native + Firebase + Android Notification Listener
 */

import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';

import {AuthProvider} from './src/contexts/AuthContext';
import {HouseholdProvider} from './src/contexts/HouseholdContext';
import {CustomAlertProvider} from './src/components/CustomAlert';
import AppNavigator from './src/navigation/AppNavigator';
import {Colors} from './src/theme/colors';

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={Colors.Background}
          translucent={false}
        />
        <AuthProvider>
          <HouseholdProvider>
            <CustomAlertProvider>
              <AppNavigator />
            </CustomAlertProvider>
          </HouseholdProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
