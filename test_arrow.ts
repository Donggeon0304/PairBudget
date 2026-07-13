import { parseNotification } from './src/services/BankNotificationParser';

console.log(parseNotification('카카오뱅크 입금 1원\n명동건 → 입출금통장(1893)', 'com.kakaobank.channel'));
