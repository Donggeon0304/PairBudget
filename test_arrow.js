"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var BankNotificationParser_1 = require("./src/services/BankNotificationParser");
console.log((0, BankNotificationParser_1.parseNotification)('카카오뱅크 입금 1원\n명동건 → 입출금통장(1893)', 'com.kakaobank.channel'));
