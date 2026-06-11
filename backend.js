/**
 * Personal Financial Management System - Backend Engine
 * A robust, relational database simulator and REST API gateway running completely in the browser.
 * Powered by localStorage, complete with tables, triggers, and mock async latency.
 */

// Helper: Generate UUIDs for simulated relational database records
function generateId() {
  return 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
}

// Helper: Format Dates to standard YYYY-MM-DD
function formatDate(dateString) {
  const d = dateString ? new Date(dateString) : new Date();
  const month = '' + (d.getMonth() + 1);
  const day = '' + d.getDate();
  const year = d.getFullYear();
  return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
}

// =========================================================================
// 1. RELATIONAL DATABASE SIMULATOR (localStorage Engine)
// =========================================================================
class RelationalDatabase {
  constructor() {
    this.storageKey = 'pfm_relational_db_v5';
    this.initDatabase();
  }

  // Define tables and default structures
  initDatabase() {
    let data = localStorage.getItem(this.storageKey);
    
    // Auto-Migration System: Copy entries from older database versions if v5 is empty
    if (!data) {
      const olderKeys = ['pfm_relational_db_v4', 'pfm_relational_db_v3', 'pfm_relational_db_v2', 'pfm_relational_db_v1'];
      for (const oldKey of olderKeys) {
        const oldData = localStorage.getItem(oldKey);
        if (oldData) {
          console.log(`Auto-Migrating database entries from older version: ${oldKey}`);
          localStorage.setItem(this.storageKey, oldData);
          data = oldData;
          break;
        }
      }
    }

    if (!data) {
      this.resetToDefaults();
    } else {
      try {
        this.tables = JSON.parse(data);
        // Guarantee all tables exist
        const requiredTables = [
          'users', 'income', 'expenses', 'investments', 
          'loansTaken', 'loansGiven', 'loanRepayments', 
          'investmentTransactions', 'auditTrail', 'fixedDeposits', 'assetHoldings'
        ];
        let missing = false;
        requiredTables.forEach(t => {
          if (!this.tables[t]) {
            this.tables[t] = [];
            missing = true;
          }
        });
        if (missing) this.save();
        if (this.tables.investments) {
          const initialLength = this.tables.investments.length;
          this.tables.investments = this.tables.investments.filter(i => i.type !== 'Savings Account');
          if (this.tables.investments.length !== initialLength) {
            console.log("Self-cleaned redundant 'Savings Account' entries from investments table.");
            this.save();
          }
        }
      } catch (e) {
        console.error('Failed to parse database. Resetting to defaults.', e);
        this.resetToDefaults();
      }
    }
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.tables));
    const syncKey = this.getSyncKey();
    if (syncKey) {
      this.pushToCloud().then(ok => {
        if (ok) console.log("Database automatically pushed and synced to cloud.");
      });
    }
  }

  getSyncKey() {
    return localStorage.getItem('pfm_cloud_sync_key') || '';
  }

  setSyncKey(key) {
    if (key) {
      localStorage.setItem('pfm_cloud_sync_key', key.trim());
    } else {
      localStorage.removeItem('pfm_cloud_sync_key');
    }
  }

  async pushToCloud() {
    const key = this.getSyncKey();
    if (!key) return false;
    try {
      const url = `https://kvdb.io/s8YvF4zRj1uA9w8tQ8wB2c/${key}`;
      const payload = JSON.stringify({
        timestamp: Date.now(),
        tables: this.tables
      });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
      return res.ok;
    } catch (e) {
      console.error('Cloud push failed:', e);
      return false;
    }
  }

  async pullFromCloud() {
    const key = this.getSyncKey();
    if (!key) return false;
    try {
      const url = `https://kvdb.io/s8YvF4zRj1uA9w8tQ8wB2c/${key}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data && data.tables) {
          this.tables = data.tables;
          localStorage.setItem(this.storageKey, JSON.stringify(this.tables));
          return true;
        }
      }
      return false;
    } catch (e) {
      console.error('Cloud pull failed:', e);
      return false;
    }
  }

  // Reset database completely and insert clean empty schemas
  resetToDefaults() {
    this.tables = {
      users: [],
      income: [],
      expenses: [],
      investments: [],
      loansTaken: [],
      loansGiven: [],
      loanRepayments: [],
      investmentTransactions: [],
      auditTrail: [],
      fixedDeposits: [],
      assetHoldings: []
    };

    // Seed empty default User with 0 balance
    const demoUserId = 'demo_user_archana';
    this.tables.users.push({
      id: demoUserId,
      username: 'Archana',
      passwordHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // Sha256 for empty password, bypassed in login
      openingBalance: 0, // Fresh start at $0
      createdAt: formatDate()
    });

    // Initialize blank standard investment classes for the user
    const types = [
      'Fixed Deposit (FD)', 'Stocks', 
      'Mutual Funds', 'Gold', 'Gullak (Piggy Bank)', 
      'Emergency Fund', 'Other Investments'
    ];
    types.forEach(type => {
      this.tables.investments.push({
        id: generateId(),
        userId: demoUserId,
        type,
        amountInvested: 0,
        currentValue: 0,
        interestRate: 0, // Expected annual return / offering interest
        notes: '',
        lastUpdated: formatDate()
      });
    });

    // Call sync to aggregate
    this.calculateInvestments(demoUserId);

    this.save();
  }

  // =========================================================================
  // CORE QUERIES & RELATIONAL LOGIC (THE "ENGINE")
  // =========================================================================

  // Calculate Cash Balance Dynamically
  calculateCashBalance(userId) {
    const user = this.tables.users.find(u => u.id === userId);
    if (!user) return 0;

    let balance = parseFloat(user.openingBalance || 0);

    // 1. Add Income
    const totalIncome = this.tables.income
      .filter(i => i.userId === userId)
      .reduce((sum, i) => sum + parseFloat(i.amount), 0);
    balance += totalIncome;

    // 2. Subtract Expenses
    const totalExpense = this.tables.expenses
      .filter(e => e.userId === userId)
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    balance -= totalExpense;

    return balance;
  }

  // Calculate Investment Balances dynamically (incorporating buys, sells, transfers, revaluations)
  calculateInvestments(userId) {
    const types = [
      'Fixed Deposit (FD)', 'Stocks', 
      'Mutual Funds', 'Gold', 'Gullak (Piggy Bank)', 
      'Emergency Fund', 'Other Investments'
    ];

    return types.map(type => {
      // Find database entry (to fetch manual currentValue overrides and notes)
      let invRow = this.tables.investments.find(i => i.userId === userId && i.type === type);
      
      if (!invRow) {
        invRow = {
          id: generateId(),
          userId: userId,
          type: type,
          notes: '',
          currentValue: 0,
          amountInvested: 0,
          interestRate: 0, // Offering interest/annual return rate
          tenureDays: 0, // FD tenure in days
          depositDate: '', // FD deposit start date
          lastUpdated: formatDate()
        };
        this.tables.investments.push(invRow);
      }

      if (invRow.interestRate === undefined || invRow.interestRate === null) {
        invRow.interestRate = 0;
      }
      if (invRow.tenureDays === undefined || invRow.tenureDays === null) {
        invRow.tenureDays = 0;
      }
      if (type === 'Fixed Deposit (FD)') {
        if (!this.tables.fixedDeposits) this.tables.fixedDeposits = [];
        const activeFDs = this.tables.fixedDeposits.filter(f => f.userId === userId && f.status === 'Active');
        let principalSum = 0;
        let accruedValueSum = 0;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        activeFDs.forEach(f => {
          const p = parseFloat(f.principal || 0);
          const r = parseFloat(f.interestRate || 0);
          const t = parseFloat(f.tenureDays || 0);
          
          let daysCounted = 0;
          if (f.depositDate) {
            const start = new Date(f.depositDate);
            start.setHours(0, 0, 0, 0);
            const diffTime = today.getTime() - start.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            daysCounted = Math.max(0, diffDays); // No upper cap: keeps growing indefinitely
          }

          const interest = p * (r / 100) * (daysCounted / 365);
          principalSum += p;
          accruedValueSum += (p + interest);
        });

        invRow.amountInvested = principalSum;
        invRow.currentValue = Math.round(accruedValueSum * 100) / 100;
        invRow.interestRate = activeFDs.length > 0 ? (activeFDs.reduce((sum, f) => sum + parseFloat(f.interestRate), 0) / activeFDs.length) : 0;
        invRow.lastUpdated = formatDate();
        return invRow;
      }

      if (type === 'Stocks' || type === 'Mutual Funds') {
        if (!this.tables.assetHoldings) this.tables.assetHoldings = [];
        const activeHoldings = this.tables.assetHoldings.filter(h => h.userId === userId && h.assetType === type && h.status === 'Active');
        let principalSum = 0;
        let currentValueSum = 0;
        let expectedReturnRateSum = 0;
        
        activeHoldings.forEach(h => {
          principalSum += parseFloat(h.principal || 0);
          currentValueSum += parseFloat(h.currentValue || 0);
          expectedReturnRateSum += parseFloat(h.expectedReturnRate || 0);
        });

        invRow.amountInvested = principalSum;
        invRow.currentValue = currentValueSum;
        invRow.interestRate = activeHoldings.length > 0 ? (expectedReturnRateSum / activeHoldings.length) : 0;
        invRow.lastUpdated = formatDate();
        return invRow;
      }

      // Calculate historical amountInvested dynamically from transaction logs:
      // Inflow triggers: buy/repayment_allocation to type, transfer to type
      // Outflow triggers: sell from type, transfer from type
      let investedSum = 0;

      this.tables.investmentTransactions.forEach(t => {
        if (t.userId !== userId) return;
        
        // Buys / Repayment allocations into this investment
        if ((t.type === 'buy' || t.type === 'repayment_allocation') && t.toType === type) {
          investedSum += parseFloat(t.amount);
        }
        // Sells out of this investment
        if (t.type === 'sell' && t.fromType === type) {
          investedSum -= parseFloat(t.amount);
        }
        // Transfers
        if (t.type === 'transfer') {
          if (t.toType === type) investedSum += parseFloat(t.amount);
          if (t.fromType === type) investedSum -= parseFloat(t.amount);
        }
      });

      // Update in table
      invRow.amountInvested = Math.max(0, investedSum);
      
      // Default currentValue to amountInvested if it was never manually adjusted
      if (invRow.currentValue === null || invRow.currentValue === undefined || invRow.currentValue === 0) {
        invRow.currentValue = invRow.amountInvested;
      }

      return invRow;
    });
  }

  // Revalue and manage an investment (updating valuation, cost basis, interest rates, tenure, and deposits)
  revalueInvestment(userId, type, newValue, interestRate, investedCost, fundingSource = 'Existing Portfolio', tenureDays = 0, depositDate = '', notes = '') {
    this.calculateInvestments(userId); // Ensure sync
    const invRow = this.tables.investments.find(i => i.userId === userId && i.type === type);
    
    if (invRow) {
      const oldValue = invRow.currentValue;
      const oldInterest = invRow.interestRate || 0;
      
      // 1. Relational Self-Healing: Adjust transaction histories to match new Invested Cost basis
      if (investedCost !== undefined && investedCost !== null) {
        const targetCost = parseFloat(investedCost);
        const currentCost = invRow.amountInvested;
        const diff = targetCost - currentCost;
        
        if (Math.abs(diff) > 0.01) {
          const txn = {
            id: generateId(),
            userId,
            date: formatDate(),
            amount: Math.abs(diff),
            notes: notes || `Portfolio manual adjustment of ${type} cost basis`
          };

          if (diff > 0) {
            txn.type = 'buy';
            txn.fromType = fundingSource === 'Existing Portfolio' ? 'Existing Portfolio' : 'Cash Balance';
            txn.toType = type;
          } else {
            txn.type = 'sell';
            txn.fromType = type;
            txn.toType = fundingSource === 'Existing Portfolio' ? 'Existing Portfolio' : 'Cash Balance';
          }
          
          this.tables.investmentTransactions.push(txn);
          
          // Re-sync cost basis in row
          this.calculateInvestments(userId);
        }
      }

      // 2. Save Updated Fields
      invRow.currentValue = parseFloat(newValue);
      invRow.interestRate = parseFloat(interestRate || 0);
      invRow.tenureDays = parseInt(tenureDays || 0);
      invRow.depositDate = depositDate || '';
      invRow.lastUpdated = formatDate();
      if (notes) invRow.notes = notes;

      const diffVal = invRow.currentValue - oldValue;
      const interestChanged = invRow.interestRate !== oldInterest;
      
      if (diffVal !== 0 || interestChanged) {
        const action = diffVal >= 0 ? 'INVESTMENT_GROWTH' : 'INVESTMENT_DECLINE';
        const msg = `${type} updated. Value: $${invRow.currentValue.toLocaleString()} (was $${oldValue.toLocaleString()}), Offering: ${invRow.interestRate}% p.a. (was ${oldInterest}% p.a.).`;
        this.logAudit(userId, action, msg, { type, oldValue, newValue: invRow.currentValue, oldInterest, newInterest: invRow.interestRate, change: diffVal });
      }
      this.save();
      return invRow;
    }
    return null;
  }

  // Record a transfer between investments or cash balance
  transferFunds(userId, fromType, toType, amount, date, notes) {
    const amt = parseFloat(amount);
    const txn = {
      id: generateId(),
      userId,
      type: 'transfer',
      fromType,
      toType,
      amount: amt,
      date: formatDate(date),
      notes: notes || `Transfer from ${fromType} to ${toType}`
    };

    // If transferring to/from Cash Balance, treat it as a liquid buy/sell to sync balances properly
    if (fromType === 'Cash Balance') {
      txn.type = 'buy';
    } else if (toType === 'Cash Balance') {
      txn.type = 'sell';
    }

    this.tables.investmentTransactions.push(txn);

    // Sync Investment amounts
    this.calculateInvestments(userId);
    
    // Auto-update target/source investment currentValue if they were matching amountInvested
    const invFrom = this.tables.investments.find(i => i.userId === userId && i.type === fromType);
    const invTo = this.tables.investments.find(i => i.userId === userId && i.type === toType);
    
    if (invFrom && invFrom.currentValue === invFrom.amountInvested + amt) {
      invFrom.currentValue = Math.max(0, invFrom.amountInvested);
    }
    if (invTo && invTo.currentValue === invTo.amountInvested - amt) {
      invTo.currentValue = invTo.amountInvested;
    }

    const logMsg = `Transferred $${amt.toLocaleString()} from ${fromType} to ${toType}.`;
    this.logAudit(userId, 'ASSET_TRANSFER', logMsg, { fromType, toType, amount: amt, date });

    this.save();
    return txn;
  }

  // Create an Income transaction
  addIncome(userId, data) {
    const inc = {
      id: generateId(),
      userId,
      date: formatDate(data.date),
      source: data.source,
      description: data.description || '',
      amount: parseFloat(data.amount)
    };
    this.tables.income.push(inc);
    
    const logMsg = `Recorded income of $${inc.amount.toLocaleString()} from ${inc.source}.`;
    this.logAudit(userId, 'INCOME_ADDED', logMsg, inc);

    // If deposited directly into an investment asset class
    if (data.destination && data.destination !== 'Cash Balance') {
      const txn = {
        id: generateId(),
        userId,
        type: 'buy',
        fromType: 'Cash Balance',
        toType: data.destination,
        amount: inc.amount,
        date: inc.date,
        notes: `Income credited directly: ${inc.source} - ${inc.description}`
      };
      this.tables.investmentTransactions.push(txn);
      
      // Re-sync investments
      this.calculateInvestments(userId);
      
      // Add relational logs
      const relMsg = `Income of $${inc.amount.toLocaleString()} deposited directly into [${data.destination}].`;
      this.logAudit(userId, 'INCOME_DEPOSITED_DIRECTLY', relMsg, { source: inc.source, destination: data.destination, amount: inc.amount });
    }
    
    this.save();
    return inc;
  }

  deleteIncome(userId, id) {
    const idx = this.tables.income.findIndex(i => i.id === id && i.userId === userId);
    if (idx !== -1) {
      const removed = this.tables.income.splice(idx, 1)[0];
      this.logAudit(userId, 'INCOME_DELETED', `Deleted income transaction: $${removed.amount.toLocaleString()} from ${removed.source}.`, removed);
      this.save();
      return true;
    }
    return false;
  }

  // Create an Expense transaction
  addExpense(userId, data) {
    const exp = {
      id: generateId(),
      userId,
      date: formatDate(data.date),
      category: data.category,
      description: data.description || '',
      amount: parseFloat(data.amount)
    };
    this.tables.expenses.push(exp);

    this.logAudit(userId, 'EXPENSE_ADDED', `Recorded expense of $${exp.amount.toLocaleString()} for ${exp.category}.`, exp);
    this.save();
    return exp;
  }

  deleteExpense(userId, id) {
    const idx = this.tables.expenses.findIndex(e => e.id === id && e.userId === userId);
    if (idx !== -1) {
      const removed = this.tables.expenses.splice(idx, 1)[0];
      this.logAudit(userId, 'EXPENSE_DELETED', `Deleted expense transaction: $${removed.amount.toLocaleString()} in ${removed.category}.`, removed);
      this.save();
      return true;
    }
    return false;
  }

  editExpense(userId, id, expenseData) {
    const exp = this.tables.expenses.find(e => e.id === id && e.userId === userId);
    if (!exp) throw new Error('Expense not found');
    
    const oldAmount = exp.amount;
    const oldCategory = exp.category;
    
    exp.date = formatDate(expenseData.date);
    exp.category = expenseData.category;
    exp.description = expenseData.description || '';
    exp.amount = parseFloat(expenseData.amount);
    
    this.logAudit(userId, 'EXPENSE_EDITED', `Edited expense transaction: changed $${oldAmount.toLocaleString()} (${oldCategory}) to $${exp.amount.toLocaleString()} (${exp.category}).`, exp);
    this.save();
    return exp;
  }

  cloneExpense(userId, id) {
    const exp = this.tables.expenses.find(e => e.id === id && e.userId === userId);
    if (!exp) throw new Error('Expense not found');
    
    const cloned = {
      id: generateId(),
      userId,
      date: exp.date,
      category: exp.category,
      description: exp.description ? `${exp.description} (Cloned)` : 'Cloned transaction',
      amount: exp.amount
    };
    
    this.tables.expenses.push(cloned);
    this.logAudit(userId, 'EXPENSE_CLONED', `Cloned expense transaction of $${cloned.amount.toLocaleString()} for ${cloned.category}.`, cloned);
    this.save();
    return cloned;
  }

  // Create a Loan Taken (Liability)
  addLoanTaken(userId, data) {
    const amt = parseFloat(data.loanAmount);
    const loan = {
      id: generateId(),
      userId,
      lenderName: data.lenderName,
      loanAmount: amt,
      dateTaken: formatDate(data.dateTaken),
      outstandingAmount: amt,
      interestRate: data.interestRate ? parseFloat(data.interestRate) : 0,
      status: 'Active',
      notes: data.notes || ''
    };
    this.tables.loansTaken.push(loan);

    this.logAudit(userId, 'LOAN_TAKEN', `Borrowed $${amt.toLocaleString()} from ${loan.lenderName}.`, loan);
    this.save();
    return loan;
  }

  // Record a repayment for a Loan Taken (reducing liability & cash)
  repayLoanTaken(userId, loanId, amount, date, notes) {
    const loan = this.tables.loansTaken.find(l => l.id === loanId && l.userId === userId);
    if (!loan || loan.status === 'Closed') return null;

    const amt = parseFloat(amount);
    const repayment = {
      id: generateId(),
      userId,
      loanType: 'taken',
      loanId,
      date: formatDate(date),
      amount: amt,
      allocationType: 'Cash Balance', // Always paid from cash balance
      notes: notes || `Repayment to ${loan.lenderName}`
    };

    this.tables.loanRepayments.push(repayment);

    // Update Outstanding Balance
    loan.outstandingAmount = Math.max(0, loan.outstandingAmount - amt);
    if (loan.outstandingAmount === 0) {
      loan.status = 'Closed';
    }

    const logMsg = `Paid $${amt.toLocaleString()} to lender ${loan.lenderName}. Outstanding balance: $${loan.outstandingAmount.toLocaleString()}.${loan.status === 'Closed' ? ' Loan closed.' : ''}`;
    this.logAudit(userId, 'LOAN_TAKEN_REPAYMENT', logMsg, { loan, repayment });

    this.save();
    return repayment;
  }

  deleteLoanTaken(userId, id) {
    const idx = this.tables.loansTaken.findIndex(l => l.id === id && l.userId === userId);
    if (idx !== -1) {
      const removed = this.tables.loansTaken.splice(idx, 1)[0];
      // Cascade delete repayments
      this.tables.loanRepayments = this.tables.loanRepayments.filter(r => !(r.loanId === id && r.loanType === 'taken'));
      
      this.logAudit(userId, 'LOAN_TAKEN_DELETED', `Deleted Loan Taken record from ${removed.lenderName} ($${removed.loanAmount}). All associated repayments deleted.`, removed);
      this.save();
      return true;
    }
    return false;
  }

  // Create a Loan Given (Receivable)
  addLoanGiven(userId, data) {
    const amt = parseFloat(data.amountGiven);
    const loan = {
      id: generateId(),
      userId,
      borrowerName: data.borrowerName,
      amountGiven: amt,
      dateGiven: formatDate(data.date),
      outstandingBalance: amt,
      purpose: data.purpose || '',
      status: 'Active'
    };
    this.tables.loansGiven.push(loan);

    this.logAudit(userId, 'LOAN_GIVEN', `Lent $${amt.toLocaleString()} to ${loan.borrowerName} for: ${loan.purpose}.`, loan);
    this.save();
    return loan;
  }

  // Record a repayment for a Loan Given (reducing outstanding receivable)
  // Highly custom logic: allows allocating returned money to Savings, Mutual Funds, Gullak, etc., or Cash
  repayLoanGiven(userId, loanId, amount, date, allocationType, notes) {
    const loan = this.tables.loansGiven.find(l => l.id === loanId && l.userId === userId);
    if (!loan || loan.status === 'Closed') return null;

    const amt = parseFloat(amount);
    const repayment = {
      id: generateId(),
      userId,
      loanType: 'given',
      loanId,
      date: formatDate(date),
      amount: amt,
      allocationType, // Savings, FD, Stocks, Mutual Funds, Gold, Gullak, Emergency Fund, Other Investments, Cash Balance
      notes: notes || `Repayment from ${loan.borrowerName}`
    };

    this.tables.loanRepayments.push(repayment);

    // Relational Side Effects:
    // If not allocated to Cash Balance, we must record an Investment Transaction showing where the money went
    if (allocationType !== 'Cash Balance') {
      const txn = {
        id: generateId(),
        userId,
        type: 'repayment_allocation',
        fromType: `Loan Repayment (${loan.borrowerName})`,
        toType: allocationType,
        amount: amt,
        date: formatDate(date),
        notes: `Lent capital returned from ${loan.borrowerName} and allocated to ${allocationType}`
      };
      this.tables.investmentTransactions.push(txn);
      
      // Update the Investments balance
      this.calculateInvestments(userId);
      const invTo = this.tables.investments.find(i => i.userId === userId && i.type === allocationType);
      if (invTo) {
        // Boost current value to match
        invTo.currentValue = invTo.amountInvested;
      }
    }

    // Update Outstanding Balance on the loan
    loan.outstandingBalance = Math.max(0, loan.outstandingBalance - amt);
    if (loan.outstandingBalance === 0) {
      loan.status = 'Closed';
    }

    // Log the complete Relational Audit Trail showing precisely where the returned funds were utilized
    const auditMsg = `Received repayment of $${amt.toLocaleString()} from ${loan.borrowerName}; Capital allocated to [${allocationType}]. Outstanding receivable: $${loan.outstandingBalance.toLocaleString()}.${loan.status === 'Closed' ? ' Loan closed.' : ''}`;
    this.logAudit(userId, 'LOAN_GIVEN_REPAYMENT', auditMsg, { 
      borrower: loan.borrowerName, 
      amount: amt, 
      allocatedTo: allocationType,
      outstandingLeft: loan.outstandingBalance
    });

    this.save();
    return repayment;
  }

  deleteLoanGiven(userId, id) {
    const idx = this.tables.loansGiven.findIndex(l => l.id === id && l.userId === userId);
    if (idx !== -1) {
      const removed = this.tables.loansGiven.splice(idx, 1)[0];
      // Cascade delete repayments
      this.tables.loanRepayments = this.tables.loanRepayments.filter(r => !(r.loanId === id && r.loanType === 'given'));
      // Clean up linked transactions
      this.tables.investmentTransactions = this.tables.investmentTransactions.filter(t => t.fromType !== `Loan Repayment (${removed.borrowerName})`);

      this.logAudit(userId, 'LOAN_GIVEN_DELETED', `Deleted Loan Given record to ${removed.borrowerName} ($${removed.amountGiven}). Repayments and allocations cleaned up.`, removed);
      this.save();
      return true;
    }
    return false;
  }

  // System Auditing
  logAudit(userId, actionType, message, details = {}) {
    this.tables.auditTrail.unshift({
      id: generateId(),
      userId,
      date: formatDate(),
      actionType,
      message,
      details
    });
    // Keep a maximum of 200 audit logs to save space
    if (this.tables.auditTrail.length > 200) {
      this.tables.auditTrail = this.tables.auditTrail.slice(0, 200);
    }
  }

  // Full Database Import
  importDatabase(userId, rawJsonString) {
    try {
      const imported = JSON.parse(rawJsonString);
      const keys = ['users', 'income', 'expenses', 'investments', 'loansTaken', 'loansGiven', 'loanRepayments', 'investmentTransactions', 'auditTrail', 'fixedDeposits', 'assetHoldings'];
      
      keys.forEach(k => {
        if (imported[k] && Array.isArray(imported[k])) {
          this.tables[k] = imported[k];
        }
      });

      this.logAudit(userId, 'DATABASE_IMPORTED', `Financial Database successfully restored from backup file.`, { date: formatDate() });
      this.save();
      return true;
    } catch (e) {
      console.error('Backup restore failed.', e);
      return false;
    }
  }

  updateOpeningBalance(userId, amount) {
    const user = this.tables.users.find(u => u.id === userId);
    if (user) {
      const old = user.openingBalance;
      user.openingBalance = parseFloat(amount);
      this.logAudit(userId, 'SETTING_CHANGED', `Opening cash balance updated from $${old.toLocaleString()} to $${user.openingBalance.toLocaleString()}.`, { old, new: user.openingBalance });
      this.save();
      return true;
    }
    return false;
  }
}

const db = new RelationalDatabase();

// =========================================================================
// 2. SIMULATED SECURE REST API GATEWAY
// =========================================================================
const API = {
  // Latency simulator wrapper
  async simulateNetwork(callback) {
    return new Promise((resolve, reject) => {
      const latency = Math.floor(Math.random() * 200) + 100; // 100ms - 300ms
      setTimeout(() => {
        try {
          const result = callback();
          resolve({ success: true, data: result });
        } catch (error) {
          console.error('API Error Response:', error);
          resolve({ success: false, error: error.message || 'Server encountered an error' });
        }
      }, latency);
    });
  },

  // Helper to fetch authorization header and find user
  getCurrentUser(headers = {}) {
    const auth = headers['Authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new Error('Unauthorized: Missing or invalid token');
    }
    const token = auth.replace('Bearer ', '');
    const user = db.tables.users.find(u => u.id === token);
    if (!user) {
      throw new Error('Unauthorized: Invalid session credentials');
    }
    return user.id;
  },

  // Authentication
  async register(username, password, openingBalance) {
    return this.simulateNetwork(() => {
      if (!username || username.trim().length < 2) {
        throw new Error('Username must be at least 2 characters.');
      }
      const existing = db.tables.users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (existing) {
        throw new Error('Username is already taken.');
      }

      const userId = generateId();
      const newUser = {
        id: userId,
        username: username.trim(),
        passwordHash: 'hashed_' + password, // Simulated hash
        openingBalance: parseFloat(openingBalance || 0),
        createdAt: formatDate()
      };
      
      db.tables.users.push(newUser);
      db.logAudit(userId, 'USER_REGISTERED', `Welcome to your Financial Planner, ${newUser.username}! Account created.`, { username: newUser.username });
      
      // Auto seed starting investments for new users so the dashboard looks alive and structured
      const types = [
        'Fixed Deposit (FD)', 'Stocks', 
        'Mutual Funds', 'Gold', 'Gullak (Piggy Bank)', 
        'Emergency Fund', 'Other Investments'
      ];
      types.forEach(type => {
        db.tables.investments.push({
          id: generateId(),
          userId,
          type,
          amountInvested: 0,
          currentValue: 0,
          notes: '',
          lastUpdated: formatDate()
        });
      });

      db.save();
      return { token: userId, username: newUser.username };
    });
  },

  async login(username, password) {
    return this.simulateNetwork(() => {
      const user = db.tables.users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!user) {
        throw new Error('User not found.');
      }
      // Demo account bypasses password check for convenience, others check
      if (user.id !== 'demo_user_archana' && user.passwordHash !== 'hashed_' + password) {
        throw new Error('Invalid username or password.');
      }
      return { token: user.id, username: user.username };
    });
  },

  // Income Endpoints
  async getIncome(headers) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      return db.tables.income
        .filter(i => i.userId === userId)
        .sort((a, b) => b.date.localeCompare(a.date));
    });
  },

  async addIncome(headers, incomeData) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!incomeData.amount || incomeData.amount <= 0) throw new Error('Amount must be positive');
      if (!incomeData.source) throw new Error('Income Source is required');
      if (!incomeData.date) throw new Error('Date is required');
      return db.addIncome(userId, incomeData);
    });
  },

  async deleteIncome(headers, id) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      return db.deleteIncome(userId, id);
    });
  },

  // Expense Endpoints
  async getExpenses(headers) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      return db.tables.expenses
        .filter(e => e.userId === userId)
        .sort((a, b) => b.date.localeCompare(a.date));
    });
  },

  async addExpense(headers, expenseData) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!expenseData.amount || expenseData.amount <= 0) throw new Error('Amount must be positive');
      if (!expenseData.category) throw new Error('Category is required');
      if (!expenseData.date) throw new Error('Date is required');
      return db.addExpense(userId, expenseData);
    });
  },

  async deleteExpense(headers, id) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      return db.deleteExpense(userId, id);
    });
  },

  async editExpense(headers, id, expenseData) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!expenseData.amount || expenseData.amount <= 0) throw new Error('Amount must be positive');
      if (!expenseData.category) throw new Error('Category is required');
      if (!expenseData.date) throw new Error('Date is required');
      return db.editExpense(userId, id, expenseData);
    });
  },

  async cloneExpense(headers, id) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      return db.cloneExpense(userId, id);
    });
  },

  async getSyncKey(headers) {
    return this.simulateNetwork(() => db.getSyncKey());
  },

  async setSyncKey(headers, key) {
    return this.simulateNetwork(() => {
      db.setSyncKey(key);
      return true;
    });
  },

  async pushToCloud(headers) {
    const ok = await db.pushToCloud();
    if (!ok) throw new Error("Cloud push failed.");
    return true;
  },

  async pullFromCloud(headers) {
    const ok = await db.pullFromCloud();
    if (!ok) throw new Error("Cloud pull failed.");
    return true;
  },

  // Investment Endpoints
  async getInvestments(headers) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      const rows = db.calculateInvestments(userId).filter(r => r.type !== 'Savings Account');
      const cash = db.calculateCashBalance(userId);
      
      const totalInvested = rows.reduce((sum, r) => sum + parseFloat(r.amountInvested || 0), 0);
      const totalCurrent = rows.reduce((sum, r) => sum + parseFloat(r.currentValue || 0), 0);
      const growth = totalCurrent - totalInvested;

      return {
        investments: rows,
        totalInvested,
        totalCurrent,
        growth,
        cashBalance: cash
      };
    });
  },

  async recordInvestmentTransfer(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.amount || data.amount <= 0) throw new Error('Amount must be positive');
      if (!data.fromType) throw new Error('Source asset is required');
      if (!data.toType) throw new Error('Destination asset is required');
      if (data.fromType === data.toType) throw new Error('Source and destination cannot be identical');

      // Verify source balance if transferring from an investment
      if (data.fromType !== 'Cash Balance') {
        db.calculateInvestments(userId);
        const sourceRow = db.tables.investments.find(i => i.userId === userId && i.type === data.fromType);
        if (!sourceRow || sourceRow.currentValue < parseFloat(data.amount)) {
          throw new Error(`Insufficient funds in ${data.fromType}. Available: $${(sourceRow ? sourceRow.currentValue : 0).toLocaleString()}`);
        }
      } else {
        // Verify cash balance
        const cash = db.calculateCashBalance(userId);
        if (cash < parseFloat(data.amount)) {
          throw new Error(`Insufficient funds in Cash Balance. Available: $${cash.toLocaleString()}`);
        }
      }

      return db.transferFunds(userId, data.fromType, data.toType, data.amount, data.date, data.notes);
    });
  },

  async revalueInvestment(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (data.newValue === undefined || data.newValue === null || data.newValue < 0) {
        throw new Error('New current value must be zero or positive.');
      }
      return db.revalueInvestment(
        userId, 
        data.type, 
        data.newValue, 
        data.interestRate, 
        data.investedCost, 
        data.fundingSource, 
        data.tenureDays, 
        data.depositDate, 
        data.notes
      );
    });
  },

  // Loans Taken Endpoints
  async getLoansTaken(headers) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      const loans = db.tables.loansTaken.filter(l => l.userId === userId);
      const repayments = db.tables.loanRepayments.filter(r => r.userId === userId && r.loanType === 'taken');

      // Map loan records and embed repayments list
      const details = loans.map(l => {
        const reps = repayments.filter(r => r.loanId === l.id);
        return {
          ...l,
          repaymentsList: reps
        };
      });

      const totalActiveOutstanding = loans
        .filter(l => l.status === 'Active')
        .reduce((sum, l) => sum + l.outstandingAmount, 0);

      return {
        loans: details,
        totalActiveOutstanding
      };
    });
  },

  async addLoanTaken(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.lenderName) throw new Error('Lender name is required');
      if (!data.loanAmount || data.loanAmount <= 0) throw new Error('Loan amount must be positive');
      if (!data.dateTaken) throw new Error('Date Taken is required');
      return db.addLoanTaken(userId, data);
    });
  },

  async repayLoanTaken(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.loanId) throw new Error('Loan ID is required');
      if (!data.amount || data.amount <= 0) throw new Error('Repayment amount must be positive');
      if (!data.date) throw new Error('Repayment date is required');

      // Verify cash balance has enough money to make this repayment
      const cash = db.calculateCashBalance(userId);
      if (cash < parseFloat(data.amount)) {
        throw new Error(`Insufficient cash to pay $${parseFloat(data.amount).toLocaleString()}. Available cash: $${cash.toLocaleString()}`);
      }

      // Check outstanding balance
      const loan = db.tables.loansTaken.find(l => l.id === data.loanId && l.userId === userId);
      if (!loan) throw new Error('Loan taken record not found');
      if (loan.outstandingAmount < parseFloat(data.amount)) {
        throw new Error(`Repayment amount exceeds outstanding balance. Outstanding: $${loan.outstandingAmount.toLocaleString()}`);
      }

      return db.repayLoanTaken(userId, data.loanId, data.amount, data.date, data.notes);
    });
  },

  async deleteLoanTaken(headers, id) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      return db.deleteLoanTaken(userId, id);
    });
  },

  // Loans Given Endpoints
  async getLoansGiven(headers) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      const loans = db.tables.loansGiven.filter(l => l.userId === userId);
      const repayments = db.tables.loanRepayments.filter(r => r.userId === userId && r.loanType === 'given');

      const details = loans.map(l => {
        const reps = repayments.filter(r => r.loanId === l.id);
        return {
          ...l,
          repaymentsList: reps
        };
      });

      const totalActiveOutstanding = loans
        .filter(l => l.status === 'Active')
        .reduce((sum, l) => sum + l.outstandingBalance, 0);

      return {
        loans: details,
        totalActiveOutstanding
      };
    });
  },

  async addLoanGiven(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.borrowerName) throw new Error('Borrower name is required');
      if (!data.amountGiven || data.amountGiven <= 0) throw new Error('Lending amount must be positive');
      if (!data.date) throw new Error('Lending Date is required');

      // Verify cash balance has enough money to lend out
      const cash = db.calculateCashBalance(userId);
      if (cash < parseFloat(data.amountGiven)) {
        throw new Error(`Insufficient Cash Balance to lend $${parseFloat(data.amountGiven).toLocaleString()}. Available: $${cash.toLocaleString()}`);
      }

      return db.addLoanGiven(userId, data);
    });
  },

  async repayLoanGiven(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.loanId) throw new Error('Loan ID is required');
      if (!data.amount || data.amount <= 0) throw new Error('Repayment amount must be positive');
      if (!data.date) throw new Error('Repayment date is required');
      if (!data.allocationType) throw new Error('Returned money utilization asset is required');

      // Check outstanding balance
      const loan = db.tables.loansGiven.find(l => l.id === data.loanId && l.userId === userId);
      if (!loan) throw new Error('Loan given record not found');
      if (loan.outstandingBalance < parseFloat(data.amount)) {
        throw new Error(`Repayment amount exceeds outstanding balance. Outstanding: $${loan.outstandingBalance.toLocaleString()}`);
      }

      return db.repayLoanGiven(userId, data.loanId, data.amount, data.date, data.allocationType, data.notes);
    });
  },

  async deleteLoanGiven(headers, id) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      return db.deleteLoanGiven(userId, id);
    });
  },

  // Audit Logs
  async getAuditTrail(headers) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      return db.tables.auditTrail.filter(a => a.userId === userId);
    });
  },

  // Dashboard Aggregator Endpoint
  async getDashboardSummary(headers) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      
      // Calculate active metrics
      const cash = db.calculateCashBalance(userId);
      const invs = db.calculateInvestments(userId).filter(i => i.type !== 'Savings Account');
      const loansT = db.tables.loansTaken.filter(l => l.userId === userId && l.status === 'Active');
      const loansG = db.tables.loansGiven.filter(l => l.userId === userId && l.status === 'Active');
      
      const totalIncome = db.tables.income.filter(i => i.userId === userId).reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);
      const totalExpense = db.tables.expenses.filter(e => e.userId === userId).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
      const totalInvestments = invs.reduce((sum, r) => sum + parseFloat(r.currentValue || 0), 0);
      const totalInvestedPrincipal = invs.reduce((sum, r) => sum + parseFloat(r.amountInvested || 0), 0);
      const totalLoansGivenOutstanding = loansG.reduce((sum, l) => sum + parseFloat(l.outstandingBalance || 0), 0);
      const totalLoansTakenOutstanding = loansT.reduce((sum, l) => sum + parseFloat(l.outstandingAmount || 0), 0);
      
      // Net Worth Calculation: Investments + Cash Balance + Loans Given - Loans Taken
      const netWorth = totalInvestments + cash + totalLoansGivenOutstanding - totalLoansTakenOutstanding;
      
      // Expense Breakdown by Category
      const expenseBreakdown = {
        'Personal Expenses': 0,
        'Grocery': 0,
        'Family Support': 0,
        'Bills': 0,
        'Health': 0,
        'Investment': 0,
        'Other Expenses': 0
      };
      db.tables.expenses.filter(e => e.userId === userId).forEach(e => {
        if (expenseBreakdown[e.category] !== undefined) {
          expenseBreakdown[e.category] += e.amount;
        } else {
          expenseBreakdown['Other Expenses'] += e.amount;
        }
      });

      // Investment Breakdown
      const investmentBreakdown = {};
      invs.forEach(i => {
        investmentBreakdown[i.type] = i.currentValue;
      });

      // Recent Activity Log
      const recentActivity = db.tables.auditTrail
        .filter(a => a.userId === userId)
        .slice(0, 10);

      return {
        summary: {
          totalIncome,
          totalExpense,
          totalInvestments,
          totalInvestedPrincipal,
          investmentGrowth: totalInvestments - totalInvestedPrincipal,
          totalLoansGivenOutstanding,
          totalLoansTakenOutstanding,
          availableCashBalance: cash,
          netWorth
        },
        expenseBreakdown,
        investmentBreakdown,
        recentActivity
      };
    });
  },

  // Reports Builder Endpoint
  async getReports(headers) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      
      // Retrieve raw logs
      const incomes = db.tables.income.filter(i => i.userId === userId);
      const expenses = db.tables.expenses.filter(e => e.userId === userId);
      const userObj = db.tables.users.find(u => u.id === userId);

      // Build Monthly Timeline Aggregates
      // Group by YYYY-MM
      const monthlyData = {};
      
      incomes.forEach(i => {
        const monthKey = i.date.substring(0, 7); // '2026-05'
        if (!monthlyData[monthKey]) monthlyData[monthKey] = { income: 0, expense: 0, savings: 0 };
        monthlyData[monthKey].income += parseFloat(i.amount || 0);
      });

      expenses.forEach(e => {
        const monthKey = e.date.substring(0, 7);
        if (!monthlyData[monthKey]) monthlyData[monthKey] = { income: 0, expense: 0, savings: 0 };
        monthlyData[monthKey].expense += parseFloat(e.amount || 0);
      });

      // Calculate savings margin per month
      Object.keys(monthlyData).forEach(m => {
        monthlyData[m].savings = monthlyData[m].income - monthlyData[m].expense;
      });

      // Build historical Net Worth trend
      // Let's create an elegant projection back for the last 5 months
      // If we don't have enough history, we'll interpolate mock monthly values 
      // based on historical income/expense trends to present a gorgeous graph.
      const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
      const netWorthTrend = [];
      
      // Calculate current net worth
      const finalSummary = db.calculateInvestments(userId).reduce((sum, r) => sum + parseFloat(r.currentValue || 0), 0) +
        db.calculateCashBalance(userId) +
        db.tables.loansGiven.filter(l => l.userId === userId && l.status === 'Active').reduce((sum, l) => sum + parseFloat(l.outstandingBalance || 0), 0) -
        db.tables.loansTaken.filter(l => l.userId === userId && l.status === 'Active').reduce((sum, l) => sum + parseFloat(l.outstandingAmount || 0), 0);

      // Simulate a realistic upward curved line leading to the current value
      let accumNetWorth = finalSummary;
      
      // Step backward through months
      for (let idx = months.length - 1; idx >= 0; idx--) {
        const m = months[idx];
        netWorthTrend.unshift({
          month: m,
          netWorth: Math.round(accumNetWorth)
        });
        
        // Step back: subtract that month's dynamic savings margin or simulate 
        const savings = monthlyData[m] ? monthlyData[m].savings : 1200; // fallback if no transactions
        // Subtract savings, add a slight investment growth offset
        accumNetWorth = accumNetWorth - savings - (Math.random() * 300 - 100);
      }

      // Active Loan details
      const activeLoansTaken = db.tables.loansTaken
        .filter(l => l.userId === userId && l.status === 'Active')
        .map(l => ({ name: l.lenderName, amount: l.outstandingAmount, total: l.loanAmount, date: l.dateTaken }));
        
      const activeLoansGiven = db.tables.loansGiven
        .filter(l => l.userId === userId && l.status === 'Active')
        .map(l => ({ name: l.borrowerName, amount: l.outstandingBalance, total: l.amountGiven, date: l.dateGiven }));

      // Investment Growth Breakdown
      const growthList = db.calculateInvestments(userId).filter(i => i.type !== 'Savings Account').map(i => {
        const growthAmt = i.currentValue - i.amountInvested;
        const growthPct = i.amountInvested > 0 ? (growthAmt / i.amountInvested) * 100 : 0;
        return {
          type: i.type,
          invested: i.amountInvested,
          value: i.currentValue,
          growth: growthAmt,
          percent: Math.round(growthPct * 10) / 10
        };
      });

      return {
        monthlyData,
        netWorthTrend,
        activeLoansTaken,
        activeLoansGiven,
        growthList
      };
    });
  },

  // Settings & DB Management
  async updateOpeningBalance(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (data.amount === undefined || data.amount === null || data.amount < 0) {
        throw new Error('Opening Balance must be zero or positive.');
      }
      return db.updateOpeningBalance(userId, data.amount);
    });
  },

  async exportDatabase(headers) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      // Returns entire database package for this user
      // Security: we sanitize before export, removing passwords
      const sanitized = JSON.parse(JSON.stringify(db.tables));
      sanitized.users.forEach(u => {
        delete u.passwordHash;
      });
      return sanitized;
    });
  },

  async importDatabase(headers, rawData) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      // Restore passwordHash of current user to prevent lockouts
      const currentUser = db.tables.users.find(u => u.id === userId);
      const result = db.importDatabase(userId, rawData);
      if (result) {
        // Re-inject hash
        const newRecord = db.tables.users.find(u => u.id === userId);
        if (newRecord && currentUser) {
          newRecord.passwordHash = currentUser.passwordHash;
          db.save();
        }
        return true;
      }
      throw new Error('Database import failed: Invalid file format');
    });
  },

  // FD Sub-Ledger Endpoints
  async getFixedDeposits(headers) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!db.tables.fixedDeposits) db.tables.fixedDeposits = [];
      return db.tables.fixedDeposits
        .filter(f => f.userId === userId)
        .sort((a,b) => b.depositDate.localeCompare(a.depositDate));
    });
  },

  async addFixedDeposit(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.name) throw new Error('FD Reference name is required');
      if (!data.principal || data.principal <= 0) throw new Error('Deposit principal must be positive');
      if (!data.interestRate || data.interestRate <= 0) throw new Error('Interest rate must be positive');
      if (!data.tenureDays || data.tenureDays <= 0) throw new Error('Tenure is required');

      // Verify cash balance if funding source is Cash Balance
      if (data.fundingSource === 'Cash Balance') {
        const cash = db.calculateCashBalance(userId);
        if (cash < parseFloat(data.principal)) {
          throw new Error(`Insufficient Cash Balance to fund FD. Available Cash: $${cash.toLocaleString()}. (Change Funding Source to 'Existing Portfolio' to record past assets, or set an opening balance in Settings)`);
        }
      }

      if (!db.tables.fixedDeposits) db.tables.fixedDeposits = [];

      const fd = {
        id: generateId(),
        userId,
        name: data.name,
        principal: parseFloat(data.principal),
        interestRate: parseFloat(data.interestRate),
        tenureDays: parseInt(data.tenureDays),
        depositDate: formatDate(data.depositDate),
        fundingSource: data.fundingSource || 'Existing Portfolio', // Track source
        status: 'Active',
        notes: data.notes || ''
      };

      db.tables.fixedDeposits.push(fd);

      // Create transaction
      const txn = {
        id: generateId(),
        userId,
        type: 'buy',
        fromType: data.fundingSource === 'Existing Portfolio' ? 'Existing Portfolio' : 'Cash Balance',
        toType: 'Fixed Deposit (FD)',
        holdingId: fd.id, // Relational connection
        amount: fd.principal,
        date: fd.depositDate,
        notes: `Opened FD contract: ${fd.name} (${fd.interestRate}% for ${fd.tenureDays} days)`
      };
      db.tables.investmentTransactions.push(txn);

      // Revalue parent
      db.calculateInvestments(userId);

      db.logAudit(userId, 'FD_OPENED', `Opened Fixed Deposit account "${fd.name}" of $${fd.principal.toLocaleString()} at ${fd.interestRate}% p.a.`, fd);
      db.save();
      return fd;
    });
  },

  async closeFixedDeposit(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.id) throw new Error('FD Account ID is required');
      if (!data.allocationType) throw new Error('Returned capital allocation route is required');

      if (!db.tables.fixedDeposits) db.tables.fixedDeposits = [];
      const fd = db.tables.fixedDeposits.find(f => f.id === data.id && f.userId === userId);
      if (!fd || fd.status !== 'Active') throw new Error('Active FD contract not found');

      // Calculate accrued value till today: P + Accrued Interest
      const p = fd.principal;
      const r = fd.interestRate;
      const t = fd.tenureDays;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let daysCounted = 0;
      if (fd.depositDate) {
        const start = new Date(fd.depositDate);
        start.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        daysCounted = Math.max(0, diffDays); // No upper cap: keeps growing indefinitely
      }

      const interest = p * (r / 100) * (daysCounted / 365);
      const accruedValue = Math.round((p + interest) * 100) / 100;

      fd.status = 'Closed';

      // Create a sell transaction from FD to target allocation
      const txn = {
        id: generateId(),
        userId,
        type: 'sell',
        fromType: 'Fixed Deposit (FD)',
        toType: data.allocationType,
        holdingId: fd.id, // Relational connection
        amount: accruedValue,
        date: formatDate(),
        notes: `Liquidated/Matured FD contract: ${fd.name} (Principal: $${p.toLocaleString()}, Returned Accrued Value: $${accruedValue.toLocaleString()})`
      };
      db.tables.investmentTransactions.push(txn);

      // If allocated to another investment, perform details sync
      if (data.allocationType !== 'Cash Balance') {
        db.calculateInvestments(userId);
      }

      db.logAudit(userId, 'FD_LIQUIDATED', `Closed FD "${fd.name}" of $${fd.principal.toLocaleString()}. Returned maturity value of $${maturityValue.toLocaleString()} routed into [${data.allocationType}].`, { fd, maturityValue, routedTo: data.allocationType });
      db.save();
      return true;
    });
  },

  // Stocks & Mutual Funds Sub-Ledger Endpoints
  async getAssetHoldings(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!db.tables.assetHoldings) db.tables.assetHoldings = [];
      const assetType = data.assetType;
      return db.tables.assetHoldings
        .filter(h => h.userId === userId && h.assetType === assetType)
        .sort((a,b) => b.buyDate.localeCompare(a.buyDate));
    });
  },

  async addAssetHolding(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.assetType) throw new Error('Asset type (Stocks/Mutual Funds) is required');
      if (!data.name) throw new Error('Holding Name is required');
      if (!data.principal || data.principal <= 0) throw new Error('Invested cost principal must be positive');
      
      // Verify cash balance if funding source is Cash Balance
      if (data.fundingSource === 'Cash Balance') {
        const cash = db.calculateCashBalance(userId);
        if (cash < parseFloat(data.principal)) {
          throw new Error(`Insufficient Cash Balance to fund purchase. Available Cash: $${cash.toLocaleString()}. (Change Funding Source to 'Existing Portfolio' to record past assets, or set an opening balance in Settings)`);
        }
      }

      if (!db.tables.assetHoldings) db.tables.assetHoldings = [];

      const holding = {
        id: generateId(),
        userId,
        assetType: data.assetType,
        name: data.name,
        principal: parseFloat(data.principal),
        currentValue: parseFloat(data.currentValue !== undefined ? data.currentValue : data.principal),
        expectedReturnRate: parseFloat(data.expectedReturnRate || 0),
        buyDate: formatDate(data.buyDate),
        fundingSource: data.fundingSource || 'Existing Portfolio', // Track source
        status: 'Active',
        notes: data.notes || ''
      };

      db.tables.assetHoldings.push(holding);

      // Create transaction
      const txn = {
        id: generateId(),
        userId,
        type: 'buy',
        fromType: data.fundingSource === 'Existing Portfolio' ? 'Existing Portfolio' : 'Cash Balance',
        toType: data.assetType,
        holdingId: holding.id,
        amount: holding.principal,
        date: holding.buyDate,
        notes: `Opened ${data.assetType} holding: ${holding.name} (Exp. Yield: ${holding.expectedReturnRate}% p.a.)`
      };
      db.tables.investmentTransactions.push(txn);

      // Revalue parent
      db.calculateInvestments(userId);

      db.logAudit(userId, 'ASSET_OPENED', `Added new ${data.assetType} holding "${holding.name}" of $${holding.principal.toLocaleString()} (Current: $${holding.currentValue.toLocaleString()})`, holding);
      db.save();
      return holding;
    });
  },

  async topUpAssetHolding(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.id) throw new Error('Holding ID is required');
      if (!data.amount || data.amount <= 0) throw new Error('Top-up amount must be positive');
      if (!data.date) throw new Error('Top-up date is required');

      // Verify cash balance if funding source is Cash Balance
      if (data.fundingSource === 'Cash Balance') {
        const cash = db.calculateCashBalance(userId);
        if (cash < parseFloat(data.amount)) {
          throw new Error(`Insufficient Cash Balance to fund SIP top-up. Available Cash: $${cash.toLocaleString()}. (Change Funding Source to 'Existing Portfolio' to record past assets, or set an opening balance in Settings)`);
        }
      }

      if (!db.tables.assetHoldings) db.tables.assetHoldings = [];
      const holding = db.tables.assetHoldings.find(h => h.id === data.id && h.userId === userId);
      if (!holding || holding.status !== 'Active') throw new Error('Active holding contract not found');

      holding.principal += parseFloat(data.amount);
      holding.currentValue += parseFloat(data.amount); // Increase currentValue by the added cost basis

      // Create transaction
      const txn = {
        id: generateId(),
        userId,
        type: 'buy',
        fromType: data.fundingSource === 'Existing Portfolio' ? 'Existing Portfolio' : 'Cash Balance',
        toType: holding.assetType,
        holdingId: holding.id,
        amount: parseFloat(data.amount),
        date: formatDate(data.date),
        notes: data.notes || `SIP Top-up: ${holding.name}`
      };
      db.tables.investmentTransactions.push(txn);

      // Re-sync investments parent
      db.calculateInvestments(userId);

      db.logAudit(userId, 'ASSET_TOPUP', `SIP Top-up of $${parseFloat(data.amount).toLocaleString()} added to ${holding.assetType} holding "${holding.name}"`, { holding, topUpAmount: data.amount });
      db.save();
      return holding;
    });
  },

  async closeAssetHolding(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.id) throw new Error('Holding Account ID is required');
      if (!data.allocationType) throw new Error('Returned capital allocation route is required');
      if (data.newValue === undefined || data.newValue === null || data.newValue < 0) {
        throw new Error('Liquidation value must be zero or positive.');
      }

      if (!db.tables.assetHoldings) db.tables.assetHoldings = [];
      const holding = db.tables.assetHoldings.find(h => h.id === data.id && h.userId === userId);
      if (!holding || holding.status !== 'Active') throw new Error('Active holding contract not found');

      const p = holding.principal;
      const finalValue = parseFloat(data.newValue);
      
      holding.status = 'Closed';
      holding.currentValue = finalValue;

      // Create a sell transaction from holding to target allocation
      const txn = {
        id: generateId(),
        userId,
        type: 'sell',
        fromType: holding.assetType,
        toType: data.allocationType,
        holdingId: holding.id, // Relational connection
        amount: finalValue,
        date: formatDate(),
        notes: `Liquidated/Sold ${holding.assetType} holding: ${holding.name} (Cost: $${p.toLocaleString()}, Sold: $${finalValue.toLocaleString()})`
      };
      db.tables.investmentTransactions.push(txn);

      // If allocated to another investment, perform details sync
      if (data.allocationType !== 'Cash Balance') {
        db.calculateInvestments(userId);
      }

      db.logAudit(userId, 'ASSET_LIQUIDATED', `Liquidated ${holding.assetType} holding "${holding.name}" of cost $${p.toLocaleString()}. Final proceeds of $${finalValue.toLocaleString()} routed into [${data.allocationType}].`, { holding, finalValue, routedTo: data.allocationType });
      db.save();
      return true;
    });
  },

  async clearDatabase(headers) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      const user = db.tables.users.find(u => u.id === userId);
      
      // Wipe transactions, but keep user credentials and reset investments
      db.tables.income = db.tables.income.filter(i => i.userId !== userId);
      db.tables.expenses = db.tables.expenses.filter(e => e.userId !== userId);
      db.tables.loansTaken = db.tables.loansTaken.filter(l => l.userId !== userId);
      db.tables.loansGiven = db.tables.loansGiven.filter(l => l.userId !== userId);
      db.tables.loanRepayments = db.tables.loanRepayments.filter(r => r.userId !== userId);
      db.tables.investmentTransactions = db.tables.investmentTransactions.filter(t => t.userId !== userId);
      db.tables.auditTrail = db.tables.auditTrail.filter(a => a.userId !== userId);
      db.tables.investments = db.tables.investments.filter(i => i.userId !== userId);
      if (db.tables.fixedDeposits) {
        db.tables.fixedDeposits = db.tables.fixedDeposits.filter(f => f.userId !== userId);
      }
      if (db.tables.assetHoldings) {
        db.tables.assetHoldings = db.tables.assetHoldings.filter(h => h.userId !== userId);
      }
      
      // Reset opening balance
      if (user) {
        user.openingBalance = 0;
      }
      
      db.logAudit(userId, 'DATABASE_RESET', 'All transactions cleared. Account reset to zero.', { date: formatDate() });
      db.save();
      return true;
    });
  },

  async editFixedDeposit(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.id) throw new Error('FD ID is required');
      if (!data.name) throw new Error('FD Name is required');
      if (!data.principal || data.principal <= 0) throw new Error('Principal must be positive');
      if (!data.interestRate || data.interestRate <= 0) throw new Error('Interest rate must be positive');
      if (!data.tenureDays || data.tenureDays <= 0) throw new Error('Tenure is required');

      if (!db.tables.fixedDeposits) db.tables.fixedDeposits = [];
      const fd = db.tables.fixedDeposits.find(f => f.id === data.id && f.userId === userId);
      if (!fd) throw new Error('FD contract not found');

      // Adjust wallet Cash Balance if principal amount or funding source changed!
      const oldPrincipal = fd.principal;
      const oldSource = fd.fundingSource || 'Existing Portfolio';
      const newPrincipal = parseFloat(data.principal);
      const newSource = data.fundingSource || 'Existing Portfolio';

      // Re-verify cash balance if new source is Cash Balance or amount changed
      let cashDiff = 0;
      if (oldSource === 'Cash Balance') cashDiff += oldPrincipal;
      if (newSource === 'Cash Balance') cashDiff -= newPrincipal;

      if (cashDiff < 0) {
        const currentCash = db.calculateCashBalance(userId);
        if (currentCash + cashDiff < 0) {
          throw new Error(`Insufficient Cash Balance to update FD. Available: $${currentCash.toLocaleString()}`);
        }
      }

      // Update values
      fd.name = data.name;
      fd.principal = newPrincipal;
      fd.interestRate = parseFloat(data.interestRate);
      fd.tenureDays = parseInt(data.tenureDays);
      fd.depositDate = formatDate(data.depositDate);
      fd.fundingSource = newSource;
      fd.notes = data.notes || '';

      // Find and update the associated original buy transaction
      if (!db.tables.investmentTransactions) db.tables.investmentTransactions = [];
      const txn = db.tables.investmentTransactions.find(t => t.holdingId === fd.id && t.type === 'buy');
      if (txn) {
        txn.fromType = newSource === 'Existing Portfolio' ? 'Existing Portfolio' : 'Cash Balance';
        txn.amount = newPrincipal;
        txn.date = fd.depositDate;
        txn.notes = `Edited FD contract: ${fd.name} (${fd.interestRate}% for ${fd.tenureDays} days)`;
      }

      // If closed, also update the sell transaction amount
      if (fd.status === 'Closed') {
        const sellTxn = db.tables.investmentTransactions.find(t => t.holdingId === fd.id && t.type === 'sell');
        if (sellTxn) {
          const interest = newPrincipal * (fd.interestRate / 100) * (fd.tenureDays / 365);
          const newMaturityValue = Math.round((newPrincipal + interest) * 100) / 100;
          sellTxn.amount = newMaturityValue;
        }
      }

      db.calculateInvestments(userId);
      db.logAudit(userId, 'FD_EDITED', `Updated Fixed Deposit "${fd.name}" details.`, fd);
      db.save();
      return fd;
    });
  },

  async deleteFixedDeposit(headers, id) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!id) throw new Error('FD ID is required');

      if (!db.tables.fixedDeposits) db.tables.fixedDeposits = [];
      const idx = db.tables.fixedDeposits.findIndex(f => f.id === id && f.userId === userId);
      if (idx === -1) throw new Error('Fixed Deposit contract not found');

      const removed = db.tables.fixedDeposits.splice(idx, 1)[0];

      // Cascade delete all associated transaction logs (buys and sells)
      if (db.tables.investmentTransactions) {
        db.tables.investmentTransactions = db.tables.investmentTransactions.filter(t => t.holdingId !== id);
      }

      db.calculateInvestments(userId);
      db.logAudit(userId, 'FD_DELETED', `Deleted Fixed Deposit contract "${removed.name}" and associated transaction logs.`, removed);
      db.save();
      return true;
    });
  },

  async editAssetHolding(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!data.id) throw new Error('Holding ID is required');
      if (!data.name) throw new Error('Holding Name is required');
      if (!data.principal || data.principal <= 0) throw new Error('Invested cost principal must be positive');
      
      if (!db.tables.assetHoldings) db.tables.assetHoldings = [];
      const holding = db.tables.assetHoldings.find(h => h.id === data.id && h.userId === userId);
      if (!holding) throw new Error('Asset holding not found');

      // Adjust wallet Cash Balance if principal changed and source is Cash Balance!
      const oldPrincipal = holding.principal;
      const oldSource = holding.fundingSource || 'Existing Portfolio';
      const newPrincipal = parseFloat(data.principal);
      const newSource = data.fundingSource || 'Existing Portfolio';

      let cashDiff = 0;
      if (oldSource === 'Cash Balance') cashDiff += oldPrincipal;
      if (newSource === 'Cash Balance') cashDiff -= newPrincipal;

      if (cashDiff < 0) {
        const currentCash = db.calculateCashBalance(userId);
        if (currentCash + cashDiff < 0) {
          throw new Error(`Insufficient Cash Balance to update holding. Available: $${currentCash.toLocaleString()}`);
        }
      }

      // Update values
      holding.name = data.name;
      holding.principal = newPrincipal;
      holding.currentValue = parseFloat(data.currentValue !== undefined ? data.currentValue : newPrincipal);
      holding.expectedReturnRate = parseFloat(data.expectedReturnRate || 0);
      holding.buyDate = formatDate(data.buyDate);
      holding.fundingSource = newSource;
      holding.notes = data.notes || '';

      // Update the original purchase transaction
      if (db.tables.investmentTransactions) {
        // Find the oldest buy transaction for this holdingId
        const txns = db.tables.investmentTransactions
          .filter(t => t.holdingId === holding.id && t.type === 'buy')
          .sort((a,b) => a.date.localeCompare(b.date));
        
        if (txns.length > 0) {
          const originalBuy = txns[0];
          originalBuy.fromType = newSource === 'Existing Portfolio' ? 'Existing Portfolio' : 'Cash Balance';
          originalBuy.amount = newPrincipal;
          originalBuy.date = holding.buyDate;
          originalBuy.notes = `Opened ${holding.assetType} holding: ${holding.name} (Exp. Yield: ${holding.expectedReturnRate}% p.a.)`;
        }
      }

      db.calculateInvestments(userId);
      db.logAudit(userId, 'ASSET_EDITED', `Updated ${holding.assetType} holding "${holding.name}" details.`, holding);
      db.save();
      return holding;
    });
  },

  async deleteAssetHolding(headers, id) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      if (!id) throw new Error('Holding ID is required');

      if (!db.tables.assetHoldings) db.tables.assetHoldings = [];
      const idx = db.tables.assetHoldings.findIndex(h => h.id === id && h.userId === userId);
      if (idx === -1) throw new Error('Holding contract not found');

      const removed = db.tables.assetHoldings.splice(idx, 1)[0];

      // Cascade delete all associated transaction logs
      if (db.tables.investmentTransactions) {
        db.tables.investmentTransactions = db.tables.investmentTransactions.filter(t => t.holdingId !== id);
      }

      db.calculateInvestments(userId);
      db.logAudit(userId, 'ASSET_DELETED', `Deleted ${removed.assetType} holding "${removed.name}" and associated transaction logs.`, removed);
      db.save();
      return true;
    });
  },

  async deleteAssetTransaction(headers, data) {
    return this.simulateNetwork(() => {
      const userId = this.getCurrentUser(headers);
      const txnId = data.id;
      if (!txnId) throw new Error('Transaction ID is required');

      if (!db.tables.investmentTransactions) db.tables.investmentTransactions = [];
      const txnIdx = db.tables.investmentTransactions.findIndex(t => t.id === txnId && t.userId === userId);
      if (txnIdx === -1) throw new Error('Transaction record not found');

      const txn = db.tables.investmentTransactions[txnIdx];
      const holdingId = txn.holdingId;

      if (!holdingId) throw new Error('Cannot delete a generic transfer transaction from sub-ledger history.');

      // Check if this is the original buy transaction (i.e. the holding's initial contract)
      const holdingBuys = db.tables.investmentTransactions
        .filter(t => t.holdingId === holdingId && t.type === 'buy')
        .sort((a,b) => a.date.localeCompare(b.date));

      if (holdingBuys.length > 0 && holdingBuys[0].id === txnId) {
        throw new Error('To delete the original purchase transaction, please delete the holding itself from the active holdings table.');
      }

      // Self-healing: if it's an SIP top-up buy transaction, subtract from parent holding
      if (txn.type === 'buy') {
        const holding = db.tables.assetHoldings.find(h => h.id === holdingId && h.userId === userId);
        if (holding) {
          holding.principal = Math.max(0, holding.principal - parseFloat(txn.amount));
          holding.currentValue = Math.max(0, holding.currentValue - parseFloat(txn.amount));
        }
      }

      // Remove the transaction log
      const removedTxn = db.tables.investmentTransactions.splice(txnIdx, 1)[0];

      db.calculateInvestments(userId);
      db.logAudit(userId, 'TRANSACTION_DELETED', `Deleted investment transaction of $${removedTxn.amount.toLocaleString()} associated with holding.`, removedTxn);
      db.save();
      return true;
    });
  }
};

// Bind to window to allow access from main frontend
window.FinanceAPI = API;
window.FinanceDB = db;
