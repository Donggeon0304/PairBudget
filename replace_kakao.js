const fs = require('fs');

const path = 'D:/SideProjects/PairBudget/src/services/BankNotificationParser.ts';
let content = fs.readFileSync(path, 'utf8');

const newKakaoParser = `function parseKakaoBank(text: string): Partial<ParsedNotification> {
  return {
    cardIssuer: '카카오뱅크',
    transactionType: parseTransactionType(text),
    incomeOrExpense: parseIncomeOrExpense(text),
    amount: parseAmount(text),
    merchant: parseMerchantGeneric(text),
    dateTime: parseDateTime(text),
    balance: parseBalance(text),
  };
}`;

// regex to replace the entire parseKakaoBank function
content = content.replace(/function parseKakaoBank\(text: string\): Partial<ParsedNotification> \{[\s\S]*?return \{[\s\S]*?\};\n\}/, newKakaoParser);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully simplified parseKakaoBank');
