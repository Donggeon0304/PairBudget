const fs = require('fs');
const path = 'D:/SideProjects/PairBudget/src/types/index.ts';
let content = fs.readFileSync(path, 'utf8');

const newCategories = `  // 공동 계좌 수입 (기타)
  { name: '회비', group: '기타', icon: 'people-outline', color: '#E17055', type: 'income', order: 8, isDefault: true },
  { name: '생활비', group: '기타', icon: 'home-outline', color: '#0984E3', type: 'income', order: 9, isDefault: true },
  { name: '비상금', group: '기타', icon: 'shield-checkmark-outline', color: '#D63031', type: 'income', order: 10, isDefault: true },
  { name: '이월/정산', group: '기타', icon: 'sync-outline', color: '#6C5CE7', type: 'income', order: 11, isDefault: true },
  { name: '기타입금', group: '기타', icon: 'add-circle-outline', color: '#B2BEC3', type: 'income', order: 12, isDefault: true },
`;

const exportToken = 'export const DEFAULT_CATEGORIES: Omit<Category, \'id\'>[] = [';
const startIndex = content.indexOf(exportToken);

if (startIndex !== -1) {
  const endIndex = content.indexOf('];', startIndex);
  if (endIndex !== -1) {
    content = content.substring(0, endIndex) + newCategories + content.substring(endIndex);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Successfully added new income categories');
  }
} else {
  console.log('Could not find DEFAULT_CATEGORIES');
}
