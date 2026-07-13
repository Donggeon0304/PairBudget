const fs = require('fs');
const path = 'D:/SideProjects/PairBudget/src/screens/main/StatsScreen.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacement = `          {(currentData.income > 0 || currentData.expense > 0) ? (
            (() => {
              const maxVal = Math.max(currentData.income, currentData.expense);
              const incomeWidth = maxVal > 0 ? (currentData.income / maxVal) * 100 : 0;
              const expenseWidth = maxVal > 0 ? (currentData.expense / maxVal) * 100 : 0;
              
              return (
              <>
                <View style={styles.comparisonBars}>
                  {/* Income bar */}
                  <View style={styles.comparisonBarItem}>
                    <Text style={styles.comparisonLabel}>수입</Text>
                    <View style={styles.comparisonBarBg}>
                      <View
                        style={[
                          styles.comparisonBarFill,
                          {
                            width: \`\${incomeWidth}%\` as any,
                            backgroundColor: Colors.Income,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.comparisonAmount, { color: Colors.Income }]}>
                      {formatCurrency(currentData.income)}
                    </Text>
                  </View>

                  {/* Expense bar */}
                  <View style={styles.comparisonBarItem}>
                    <Text style={styles.comparisonLabel}>지출</Text>
                    <View style={styles.comparisonBarBg}>
                      <View
                        style={[
                          styles.comparisonBarFill,
                          {
                            width: \`\${expenseWidth}%\` as any,
                            backgroundColor: Colors.Expense,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.comparisonAmount, { color: Colors.Expense }]}>
                      {formatCurrency(currentData.expense)}
                    </Text>
                  </View>
                </View>
              </>
              );
            })()
          ) : (`;

const regex = /\{\(currentData\.income > 0 \|\| currentData\.expense > 0\) \? \([\s\S]*?\) : \(/;
content = content.replace(regex, replacement);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully fixed StatsScreen.tsx');
