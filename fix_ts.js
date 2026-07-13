const fs = require('fs');
const path = 'D:/SideProjects/PairBudget/src/screens/main/AddTransactionScreen.tsx';
let content = fs.readFileSync(path, 'utf8');

// Find the handleAddCategory function where newCategory is created
const regex = /const newCategory = \{\s*name: newCategoryName\.trim\(\),\s*group: newCategoryGroup\.trim\(\) \|\| undefined,\s*icon: 'pricetag-outline',\s*type: newCategoryType,\s*color: newCategoryType === 'expense' \? Colors\.Expense : Colors\.Income,\s*\};/;

const newDecl = `const newCategory = {
          name: newCategoryName.trim(),
          group: newCategoryGroup.trim() || undefined,
          icon: 'pricetag-outline',
          type: newCategoryType,
          color: newCategoryType === 'expense' ? Colors.Expense : Colors.Income,
          order: 999,
          isDefault: false,
        };`;

content = content.replace(regex, newDecl);
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed AddTransactionScreen TS error');
