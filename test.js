const fs = require('fs');
const content = fs.readFileSync('D:/PairBudget/src/services/BankNotificationParser.ts', 'utf8');
const match = content.match(/function parseMerchantGeneric[\s\S]+?(?=export function isBankSms)/);
console.log(match[0]);
