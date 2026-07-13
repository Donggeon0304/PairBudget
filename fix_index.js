const fs = require('fs');

const path = 'D:/SideProjects/PairBudget/index.js';
let content = fs.readFileSync(path, 'utf8');

// Replace the onBackgroundEvent block to do nothing on PRESS
const newHandler = `notifee.onBackgroundEvent(async ({ type, detail }) => {
  // Do nothing on PRESS here, let AppNavigator handle it via onForegroundEvent or getInitialNotification
});`;

content = content.replace(/notifee\.onBackgroundEvent\(async \(\{ type, detail \}\) => \{[\s\S]*?\}\);/, newHandler);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated index.js');
