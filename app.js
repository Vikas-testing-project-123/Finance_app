/**
 * Personal Financial Management System - Application Controller
 * Handles routing, session auth, data synchronization, dynamic Chart.js rendering,
 * form submissions, modal controllers, data exports/imports, and visual theme managers.
 */

document.addEventListener('DOMContentLoaded', () => {
  // =========================================================================
  // 1. STATE & CONSTANTS DEFINITIONS
  // =========================================================================
  const state = {
    token: localStorage.getItem('aura_auth_token'),
    username: localStorage.getItem('aura_username'),
    currentTheme: localStorage.getItem('aura_theme') || 'dark',
    activeView: '#/dashboard',
    charts: {} // Store Chart.js instances to destroy/recreate cleanly
  };

  // Shared authorization headers helper
  function getHeaders() {
    return {
      'Authorization': `Bearer ${state.token}`,
      'Content-Type': 'application/json'
    };
  }

  // Predefined CSS palette colors matching our styles.css HSL coordinates
  const CHART_PALETTE = {
    purple: ['#885df2', '#a07bf5', '#b89af8', '#cfb9fb'],
    emerald: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
    crimson: ['#f43f5e', '#fb7185', '#fda4af', '#fecdd3'],
    amber: ['#f59e0b', '#fbbf24', '#fcd34d', '#fef3c7'],
    mix: [
      '#885df2', // Purple (Primary)
      '#10b981', // Emerald (Income)
      '#f59e0b', // Amber (Loan/Receivable)
      '#f43f5e', // Crimson (Expense)
      '#3b82f6', // Bright Blue
      '#ec4899', // Pink
      '#8b5cf6', // Indigo
      '#06b6d4'  // Cyan
    ]
  };

  // =========================================================================
  // 2. VISUAL UTILITIES: TOASTS & LOADERS
  // =========================================================================
  window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Select toast icon based on feedback type
    let icon = '';
    if (type === 'success') {
      icon = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    } else if (type === 'error') {
      icon = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
    } else if (type === 'warning') {
      icon = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
    } else {
      icon = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
    }

    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);

    // Auto-remove toast after 4 seconds
    setTimeout(() => {
      toast.style.animation = 'viewFadeIn 0.3s reverse ease';
      setTimeout(() => {
        if (toast.parentNode === container) {
          container.removeChild(toast);
        }
      }, 300);
    }, 4000);
  };

  function setGlobalLoader(active) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      if (active) overlay.classList.add('active');
      else overlay.classList.remove('active');
    }
  }

  // =========================================================================
  // 3. INTERACTIVE MODAL ROUTINES
  // =========================================================================
  window.openModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('modal-active');
    }
  };

  window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('modal-active');
    }
  };

  // Safe closing when clicking outside a glass container
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });

  // =========================================================================
  // 4. THEME & VISUAL TRANSITION CONTROLLER
  // =========================================================================
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aura_theme', theme);
    state.currentTheme = theme;
    
    // Toggle icon views
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    
    if (sunIcon && moonIcon) {
      if (theme === 'light') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      }
    }

    // Refresh charts to match styling colors if active
    syncViewData();
  }

  document.getElementById('theme-toggle-trigger').addEventListener('click', () => {
    const nextTheme = state.currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });

  // Apply default local theme on startup
  applyTheme(state.currentTheme);

  // =========================================================================
  // 5. SESSION AUTHENTICATION & LOGIN CONTROLLER
  // =========================================================================
  async function checkSession() {
    const authShell = document.getElementById('auth-shell');
    const appShell = document.getElementById('app-shell');
    
    if (state.token && state.username) {
      authShell.style.display = 'none';
      appShell.style.display = 'flex';
      
      // Update sidebar details
      document.getElementById('sidebar-username').textContent = state.username;
      document.getElementById('sidebar-avatar').textContent = state.username.substring(0, 1).toUpperCase();
      document.getElementById('settings-username-display').value = state.username;
      
      // Auto-pull from cloud on startup
      const syncKey = await window.FinanceAPI.getSyncKey(getHeaders());
      if (syncKey.success && syncKey.data) {
        console.log("Cloud sync key found. Auto-pulling latest data...");
        try {
          await window.FinanceAPI.pullFromCloud(getHeaders());
          console.log("Successfully auto-pulled latest cloud database.");
        } catch (e) {
          console.warn("Auto-pull on startup failed: " + e.message);
        }
      }
      
      // Navigate to current hash or dashboard by default
      const currentHash = window.location.hash || '#/dashboard';
      router(currentHash);
    } else {
      authShell.style.display = 'flex';
      appShell.style.display = 'none';
      setGlobalLoader(false);
    }
  }

  // Auth Panel toggles (Login vs SignUp forms)
  const authToggleBtn = document.getElementById('auth-toggle-btn');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authPrompt = document.getElementById('auth-prompt-text');
  const authTitle = document.getElementById('page-title-heading');
  const authErrorBox = document.getElementById('auth-error-box');

  authToggleBtn.addEventListener('click', () => {
    authErrorBox.style.display = 'none';
    if (loginForm.style.display !== 'none') {
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
      authPrompt.textContent = 'Already have an account?';
      authToggleBtn.textContent = 'Sign In';
    } else {
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
      authPrompt.textContent = "Don't have an account?";
      authToggleBtn.textContent = 'Sign Up';
    }
  });

  // SUBMIT: LOGIN FORM
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authErrorBox.style.display = 'none';
    setGlobalLoader(true);

    const userVal = document.getElementById('login-username').value;
    const passVal = document.getElementById('login-password').value;

    const res = await window.FinanceAPI.login(userVal, passVal);
    setGlobalLoader(false);

    if (res.success) {
      state.token = res.data.token;
      state.username = res.data.username;
      localStorage.setItem('aura_auth_token', state.token);
      localStorage.setItem('aura_username', state.username);
      showToast(`Welcome back, ${state.username}!`, 'success');
      checkSession();
    } else {
      authErrorBox.textContent = res.error;
      authErrorBox.style.display = 'block';
      showToast(res.error, 'error');
    }
  });

  // SUBMIT: REGISTER FORM
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authErrorBox.style.display = 'none';
    setGlobalLoader(true);

    const userVal = document.getElementById('register-username').value;
    const passVal = document.getElementById('register-password').value;
    const openingBal = document.getElementById('register-opening-balance').value;

    const res = await window.FinanceAPI.register(userVal, passVal, openingBal);
    setGlobalLoader(false);

    if (res.success) {
      state.token = res.data.token;
      state.username = res.data.username;
      localStorage.setItem('aura_auth_token', state.token);
      localStorage.setItem('aura_username', state.username);
      showToast(`Account successfully created! Welcome, ${state.username}!`, 'success');
      checkSession();
    } else {
      authErrorBox.textContent = res.error;
      authErrorBox.style.display = 'block';
      showToast(res.error, 'error');
    }
  });

  // TRIGGER: SIGN OUT
  document.getElementById('logout-trigger').addEventListener('click', () => {
    setGlobalLoader(true);
    localStorage.removeItem('aura_auth_token');
    localStorage.removeItem('aura_username');
    state.token = null;
    state.username = null;
    showToast('Signed out successfully.', 'info');
    
    // Clear forms
    loginForm.reset();
    registerForm.reset();
    
    checkSession();
  });

  // =========================================================================
  // 6. CLIENT-SIDE HASH ROUTER
  // =========================================================================
  function router(hash) {
    if (!state.token) return; // Prevent routing if unauthenticated

    // Normalize hash route
    let route = hash;
    if (!route || route === '' || route === '#') route = '#/dashboard';
    state.activeView = route;
    window.location.hash = route;

    // Toggle active link visual elements
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active-link');
    });

    const viewContainers = document.querySelectorAll('.view-container');
    viewContainers.forEach(container => {
      container.classList.remove('active-view');
    });

    // Match route and load views
    const heading = document.getElementById('page-title-heading');
    const subtitle = document.getElementById('page-subtitle-heading');

    // Sidebar closing helper on mobile layouts
    document.getElementById('sidebar-element').classList.remove('sidebar-open');

    if (route === '#/dashboard') {
      document.getElementById('nav-dashboard').classList.add('active-link');
      document.getElementById('dashboard-view').classList.add('active-view');
      heading.textContent = 'Dashboard Overview';
      subtitle.textContent = 'Track your overall net worth, balances, and allocations.';
    } else if (route === '#/income') {
      document.getElementById('nav-income').classList.add('active-link');
      document.getElementById('income-view').classList.add('active-view');
      heading.textContent = 'Income Management';
      subtitle.textContent = 'Log all salary, interest, freelancing and business credits.';
      // Pre-set today's date in income forms
      document.getElementById('inc-date').value = formatDate(new Date());
    } else if (route === '#/expenses') {
      document.getElementById('nav-expenses').classList.add('active-link');
      document.getElementById('expenses-view').classList.add('active-view');
      heading.textContent = 'Expense Management';
      subtitle.textContent = 'Track your outflows across selective, clean categories.';
      document.getElementById('exp-date').value = formatDate(new Date());
    } else if (route === '#/investments') {
      document.getElementById('nav-investments').classList.add('active-link');
      document.getElementById('investments-view').classList.add('active-view');
      heading.textContent = 'Investments & Savings';
      subtitle.textContent = 'Monitor growth yield, balances, and execute portfolio re-allocations.';
    } else if (route === '#/loans') {
      document.getElementById('nav-loans').classList.add('active-link');
      document.getElementById('loans-view').classList.add('active-view');
      heading.textContent = 'Loans & Debts Ledger';
      subtitle.textContent = 'Manage active liabilities and receivable lending with dynamic audit flows.';
    } else if (route === '#/reports') {
      document.getElementById('nav-reports').classList.add('active-link');
      document.getElementById('reports-view').classList.add('active-view');
      heading.textContent = 'Analytics Reports';
      subtitle.textContent = 'Visualize savings ratios, growth yields, and net worth trend projection.';
    } else if (route === '#/settings') {
      document.getElementById('nav-settings').classList.add('active-link');
      document.getElementById('settings-view').classList.add('active-view');
      heading.textContent = 'System Settings';
      subtitle.textContent = 'Configure opening accounts, export database, or import system backups.';
    }

    // Trigger view updates
    syncViewData();
  }

  // Bind hash events
  window.addEventListener('hashchange', () => {
    router(window.location.hash);
  });

  // Mobile sidebar burger handler
  document.getElementById('sidebar-mobile-toggle-btn').addEventListener('click', () => {
    document.getElementById('sidebar-element').classList.toggle('sidebar-open');
  });

  // =========================================================================
  // 7. CORE VISUALIZER DATA SYNCS (THE GRAPHICS RENDERERS)
  // =========================================================================
  async function syncViewData() {
    if (!state.token) return;
    setGlobalLoader(true);

    try {
      if (state.activeView === '#/dashboard') {
        await syncDashboard();
      } else if (state.activeView === '#/income') {
        await syncIncome();
      } else if (state.activeView === '#/expenses') {
        await syncExpenses();
      } else if (state.activeView === '#/investments') {
        await syncInvestments();
      } else if (state.activeView === '#/loans') {
        await syncLoans();
      } else if (state.activeView === '#/reports') {
        await syncReports();
      } else if (state.activeView === '#/settings') {
        await syncSettings();
      }
    } catch (err) {
      console.error('Failed to sync data:', err);
      showToast('Synchronization error. Check server simulator logs.', 'error');
    }

    setGlobalLoader(false);
  }

  // Helper to destroy canvas objects before re-creating
  function cleanChart(chartName) {
    if (state.charts[chartName]) {
      state.charts[chartName].destroy();
      delete state.charts[chartName];
    }
  }

  // -------------------------------------------------------------------------
  // 7.1 VIEW CORE: DASHBOARD
  // -------------------------------------------------------------------------
  async function syncDashboard() {
    const res = await window.FinanceAPI.getDashboardSummary(getHeaders());
    if (!res.success) return showToast(res.error, 'error');

    const d = res.data;
    const sum = d.summary;

    // Update KPI UI
    document.getElementById('kpi-val-net-worth').textContent = `$${sum.netWorth.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('kpi-val-cash').textContent = `$${sum.availableCashBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('kpi-val-investments').textContent = `$${sum.totalInvestments.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // Investment Growth Text Indicator
    const growthEl = document.getElementById('kpi-val-investments-growth');
    const growthPct = sum.totalInvestedPrincipal > 0 ? (sum.investmentGrowth / sum.totalInvestedPrincipal) * 100 : 0;
    growthEl.innerHTML = `Growth: <span class="${sum.investmentGrowth >= 0 ? 'text-success' : 'text-danger'}">${sum.investmentGrowth >= 0 ? '+' : ''}$${sum.investmentGrowth.toLocaleString(undefined, {maximumFractionDigits: 0})} (${Math.round(growthPct * 10) / 10}%)</span>`;

    document.getElementById('kpi-val-loans-given').textContent = `$${sum.totalLoansGivenOutstanding.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('kpi-val-loans-taken').textContent = `$${sum.totalLoansTakenOutstanding.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    // RENDER CHART 1: Net Worth Trend
    cleanChart('dashboardNetWorth');
    
    // Retrieve monthly history logs to plot beautiful trend
    const reportData = await window.FinanceAPI.getReports(getHeaders());
    let trendLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];
    let trendPoints = [10000, 12000, 11500, 14000, sum.netWorth]; // default beautiful seed curves
    
    if (reportData.success && reportData.data.netWorthTrend && reportData.data.netWorthTrend.length > 0) {
      trendLabels = reportData.data.netWorthTrend.map(t => {
        const parts = t.month.split('-');
        const date = new Date(parts[0], parts[1] - 1);
        return date.toLocaleString('default', { month: 'short' });
      });
      trendPoints = reportData.data.netWorthTrend.map(t => t.netWorth);
      // Guarantee last element exactly matches dynamic summary Net Worth
      if (trendPoints.length > 0) {
        trendPoints[trendPoints.length - 1] = Math.round(sum.netWorth);
      }
    }

    const ctxNW = document.getElementById('chart-net-worth-trend').getContext('2d');
    const gradient = ctxNW.createLinearGradient(0, 0, 0, 300);
    const isDark = state.currentTheme === 'dark';
    
    gradient.addColorStop(0, isDark ? 'rgba(136, 93, 242, 0.4)' : 'rgba(136, 93, 242, 0.25)');
    gradient.addColorStop(1, 'rgba(136, 93, 242, 0)');

    state.charts.dashboardNetWorth = new Chart(ctxNW, {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: [{
          label: 'Net Worth ($)',
          data: trendPoints,
          borderColor: '#885df2',
          borderWidth: 3.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#885df2',
          pointHoverRadius: 8,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: isDark ? '#888' : '#666', font: { family: 'Outfit' } } },
          y: { grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }, ticks: { color: isDark ? '#888' : '#666', font: { family: 'Outfit' } } }
        }
      }
    });

    // RENDER CHART 2: Expense Category breakdowns
    cleanChart('dashboardExpenses');
    const expCategories = Object.keys(d.expenseBreakdown);
    const expValues = Object.values(d.expenseBreakdown);
    const totalExp = expValues.reduce((sum, v) => sum + v, 0);

    const ctxExp = document.getElementById('chart-expense-breakdown').getContext('2d');
    
    state.charts.dashboardExpenses = new Chart(ctxExp, {
      type: 'doughnut',
      data: {
        labels: expCategories,
        datasets: [{
          data: expValues,
          backgroundColor: CHART_PALETTE.mix.slice(0, expCategories.length),
          borderWidth: isDark ? 2 : 1,
          borderColor: isDark ? '#141419' : '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: { legend: { display: false } }
      }
    });

    // Populate Custom Interactive Legend inside Sidebar Card
    const expLegendEl = document.getElementById('dashboard-expense-legend');
    expLegendEl.innerHTML = '';
    
    if (totalExp === 0) {
      expLegendEl.innerHTML = '<div class="text-muted" style="text-align:center; padding:1rem; font-size:0.8rem;">No expenses recorded yet.</div>';
    } else {
      expCategories.forEach((cat, idx) => {
        const val = expValues[idx];
        if (val === 0) return;
        const pct = Math.round((val / totalExp) * 100);
        
        const item = document.createElement('div');
        item.className = 'distribution-item';
        item.innerHTML = `
          <div class="distribution-label-group">
            <span class="distribution-dot" style="background:${CHART_PALETTE.mix[idx]};"></span>
            <span>${cat}</span>
          </div>
          <span class="distribution-value">$${val.toLocaleString(undefined, {maximumFractionDigits: 0})} (${pct}%)</span>
        `;
        expLegendEl.appendChild(item);
      });
    }

    // RENDER CHART 3: Investment distribution
    cleanChart('dashboardInvestments');
    const invTypes = Object.keys(d.investmentBreakdown);
    const invValues = Object.values(d.investmentBreakdown);
    const totalInvVal = invValues.reduce((sum, v) => sum + v, 0);

    const ctxInv = document.getElementById('chart-investment-distribution').getContext('2d');
    
    state.charts.dashboardInvestments = new Chart(ctxInv, {
      type: 'doughnut',
      data: {
        labels: invTypes,
        datasets: [{
          data: invValues,
          backgroundColor: CHART_PALETTE.mix.slice(0, invTypes.length),
          borderWidth: isDark ? 2 : 1,
          borderColor: isDark ? '#141419' : '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: { legend: { display: false } }
      }
    });

    // Populate dynamic legend list for investments
    const invLegendEl = document.getElementById('dashboard-investment-legend');
    invLegendEl.innerHTML = '';
    
    if (totalInvVal === 0) {
      invLegendEl.innerHTML = '<div class="text-muted" style="text-align:center; padding:1rem; font-size:0.8rem;">Portfolio is empty. Add starting assets!</div>';
    } else {
      invTypes.forEach((type, idx) => {
        const val = invValues[idx];
        if (val === 0) return;
        const pct = Math.round((val / totalInvVal) * 100);
        
        const item = document.createElement('div');
        item.className = 'distribution-item';
        item.innerHTML = `
          <div class="distribution-label-group">
            <span class="distribution-dot" style="background:${CHART_PALETTE.mix[idx]};"></span>
            <span>${type}</span>
          </div>
          <span class="distribution-value">$${val.toLocaleString(undefined, {maximumFractionDigits: 0})} (${pct}%)</span>
        `;
        invLegendEl.appendChild(item);
      });
    }

    // UPDATE: Dynamic Audit Log Feed
    const auditFeed = document.getElementById('dashboard-audit-feed');
    auditFeed.innerHTML = '';
    
    if (d.recentActivity.length === 0) {
      auditFeed.innerHTML = '<div class="text-muted" style="text-align:center; padding:1.5rem; font-size:0.85rem;">No activity log recorded yet.</div>';
    } else {
      d.recentActivity.forEach(a => {
        const item = document.createElement('div');
        item.className = 'audit-item';
        
        // Match marker colors to categories
        let typeClass = 'audit-transfer';
        if (a.actionType.includes('INCOME')) typeClass = 'audit-inflow';
        else if (a.actionType.includes('EXPENSE')) typeClass = 'audit-outflow';
        else if (a.actionType.includes('REPAYMENT') || a.actionType.includes('LOAN')) typeClass = 'audit-pending';

        item.innerHTML = `
          <div class="audit-marker ${typeClass}"></div>
          <div class="audit-item-body">
            <span class="audit-msg">${a.message}</span>
            <div class="audit-meta">
              <span>${a.date}</span>
              <span>•</span>
              <span style="font-weight:700;">${a.actionType.replace('_', ' ')}</span>
            </div>
          </div>
        `;
        auditFeed.appendChild(item);
      });
    }
  }

  // -------------------------------------------------------------------------
  // 7.2 VIEW CORE: INCOME
  // -------------------------------------------------------------------------
  async function syncIncome() {
    const res = await window.FinanceAPI.getIncome(getHeaders());
    if (!res.success) return showToast(res.error, 'error');
    
    const rowsTarget = document.getElementById('income-rows-target');
    rowsTarget.innerHTML = '';

    const list = res.data;
    const filterText = document.getElementById('inc-search').value.toLowerCase().trim();

    const filtered = list.filter(i => {
      return i.source.toLowerCase().includes(filterText) || 
             (i.description && i.description.toLowerCase().includes(filterText)) ||
             i.amount.toString().includes(filterText) ||
             i.date.includes(filterText);
    });

    if (filtered.length === 0) {
      rowsTarget.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-subtle);">No incomes match the filter criteria.</td></tr>';
    } else {
      filtered.forEach(i => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:600;">${i.date}</td>
          <td><span class="badge badge-success">${i.source}</span></td>
          <td style="color:var(--text-muted);">${i.description || '—'}</td>
          <td style="font-weight:700; font-family:var(--font-display); color:hsl(var(--emerald-base));">+$${i.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
          <td>
            <button class="btn btn-danger btn-sm delete-inc-btn" data-id="${i.id}" style="padding:0.35rem 0.65rem; font-size:0.75rem; border-radius:var(--border-radius-sm);">✕</button>
          </td>
        `;
        rowsTarget.appendChild(tr);
      });

      // Bind delete handlers
      document.querySelectorAll('.delete-inc-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Delete this income record? Cash balances will adjust automatically.')) {
            const id = btn.getAttribute('data-id');
            const delRes = await window.FinanceAPI.deleteIncome(getHeaders(), id);
            if (delRes.success) {
              showToast('Income transaction removed successfully.', 'success');
              syncIncome();
            } else {
              showToast(delRes.error, 'error');
            }
          }
        });
      });
    }
  }

  // Bind Search events
  document.getElementById('inc-search').addEventListener('input', syncIncome);

  // SUBMIT: Log Income Inflow
  document.getElementById('income-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setGlobalLoader(true);

    const payload = {
      date: document.getElementById('inc-date').value,
      source: document.getElementById('inc-source').value,
      amount: document.getElementById('inc-amount').value,
      destination: document.getElementById('inc-destination').value,
      description: document.getElementById('inc-desc').value
    };

    const res = await window.FinanceAPI.addIncome(getHeaders(), payload);
    setGlobalLoader(false);

    if (res.success) {
      showToast(`Logged $${parseFloat(payload.amount).toLocaleString()} credit deposited directly to [${payload.destination}].`, 'success');
      document.getElementById('income-form').reset();
      document.getElementById('inc-date').value = formatDate(new Date());
      document.getElementById('inc-destination').value = 'Cash Balance'; // reset to liquid
      syncIncome();
    } else {
      showToast(res.error, 'error');
    }
  });

  // -------------------------------------------------------------------------
  // 7.3 VIEW CORE: EXPENSES
  // -------------------------------------------------------------------------
  async function syncExpenses() {
    const res = await window.FinanceAPI.getExpenses(getHeaders());
    if (!res.success) return showToast(res.error, 'error');

    const rowsTarget = document.getElementById('expense-rows-target');
    rowsTarget.innerHTML = '';

    const list = res.data;
    const filterText = document.getElementById('exp-search').value.toLowerCase().trim();

    const filtered = list.filter(e => {
      return e.category.toLowerCase().includes(filterText) || 
             (e.description && e.description.toLowerCase().includes(filterText)) ||
             e.amount.toString().includes(filterText) ||
             e.date.includes(filterText);
    });

    if (filtered.length === 0) {
      rowsTarget.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-subtle);">No expenses match the filter criteria.</td></tr>';
    } else {
      filtered.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:600;">${e.date}</td>
          <td><span class="badge badge-danger">${e.category}</span></td>
          <td style="color:var(--text-muted);">${e.description || '—'}</td>
          <td style="font-weight:700; font-family:var(--font-display); color:hsl(var(--crimson-base));">-$${e.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
          <td>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              <button class="btn btn-sm clone-exp-btn" data-id="${e.id}" style="padding:0.35rem 0.5rem; font-size:0.75rem; border-radius:var(--border-radius-sm); background: hsl(var(--primary-base)); color: white; border: none;" title="Clone Transaction">📋</button>
              <button class="btn btn-sm edit-exp-btn" data-id="${e.id}" data-date="${e.date}" data-category="${e.category}" data-amount="${e.amount}" data-description="${e.description || ''}" style="padding:0.35rem 0.5rem; font-size:0.75rem; border-radius:var(--border-radius-sm); background: hsl(200, 85%, 45%); color: white; border: none;" title="Edit Transaction">✏️</button>
              <button class="btn btn-danger btn-sm delete-exp-btn" data-id="${e.id}" style="padding:0.35rem 0.5rem; font-size:0.75rem; border-radius:var(--border-radius-sm);" title="Delete Transaction">✕</button>
            </div>
          </td>
        `;
        rowsTarget.appendChild(tr);
      });

      // Bind clone handlers
      document.querySelectorAll('.clone-exp-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          setGlobalLoader(true);
          const cloneRes = await window.FinanceAPI.cloneExpense(getHeaders(), id);
          setGlobalLoader(false);
          if (cloneRes.success) {
            showToast('Expense transaction cloned successfully.', 'success');
            syncExpenses();
          } else {
            showToast(cloneRes.error, 'error');
          }
        });
      });

      // Bind edit handlers
      document.querySelectorAll('.edit-exp-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const date = btn.getAttribute('data-date');
          const category = btn.getAttribute('data-category');
          const amount = btn.getAttribute('data-amount');
          const description = btn.getAttribute('data-description');
          
          document.getElementById('edit-exp-id').value = id;
          document.getElementById('edit-exp-date').value = date;
          document.getElementById('edit-exp-category').value = category;
          document.getElementById('edit-exp-amount').value = amount;
          document.getElementById('edit-exp-desc').value = description;
          
          openModal('modal-edit-expense');
        });
      });

      // Bind delete handlers
      document.querySelectorAll('.delete-exp-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Delete this expense transaction? Cash balances will restore.')) {
            const id = btn.getAttribute('data-id');
            const delRes = await window.FinanceAPI.deleteExpense(getHeaders(), id);
            if (delRes.success) {
              showToast('Expense transaction removed successfully.', 'success');
              syncExpenses();
            } else {
              showToast(delRes.error, 'error');
            }
          }
        });
      });
    }
  }

  document.getElementById('exp-search').addEventListener('input', syncExpenses);

  // SUBMIT: Log Expense Outflow
  document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setGlobalLoader(true);

    const payload = {
      date: document.getElementById('exp-date').value,
      category: document.getElementById('exp-category').value,
      amount: document.getElementById('exp-amount').value,
      description: document.getElementById('exp-desc').value
    };

    const res = await window.FinanceAPI.addExpense(getHeaders(), payload);
    setGlobalLoader(false);

    if (res.success) {
      showToast(`Logged $${parseFloat(payload.amount).toLocaleString()} debit from Cash Balance.`, 'success');
      document.getElementById('expense-form').reset();
      document.getElementById('exp-date').value = formatDate(new Date());
      syncExpenses();
    } else {
      showToast(res.error, 'error');
    }
  });

  // -------------------------------------------------------------------------
  // 7.4 VIEW CORE: INVESTMENTS & TRANSFERS
  // -------------------------------------------------------------------------
  async function syncInvestments() {
    const res = await window.FinanceAPI.getInvestments(getHeaders());
    if (!res.success) return showToast(res.error, 'error');

    const d = res.data;

    // Load Top stat indicators
    document.getElementById('inv-val-total-principal').textContent = `$${d.totalInvested.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('inv-val-total-current').textContent = `$${d.totalCurrent.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const growthPct = d.totalInvested > 0 ? (d.growth / d.totalInvested) * 100 : 0;
    const growthTarget = document.getElementById('inv-val-total-growth');
    growthTarget.textContent = `${d.growth >= 0 ? '+' : ''}$${d.growth.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    growthTarget.className = `kpi-value ${d.growth >= 0 ? 'text-success' : 'text-danger'}`;
    
    document.getElementById('inv-val-total-growth-pct').innerHTML = `<span class="${d.growth >= 0 ? 'text-success' : 'text-danger'}" style="font-weight:700;">${Math.round(growthPct * 10) / 10}%</span> aggregate returns`;

    // Render Asset Allocation Map Table
    const mapTarget = document.getElementById('investment-rows-target');
    mapTarget.innerHTML = '';

    d.investments.forEach(i => {
      const diff = i.currentValue - i.amountInvested;
      const pct = i.amountInvested > 0 ? (diff / i.amountInvested) * 100 : 0;
      const annualReturn = i.currentValue * (parseFloat(i.interestRate || 0) / 100);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600; font-family:var(--font-display);">${i.type}</td>
        <td style="font-weight:600; color:var(--text-muted);">${i.interestRate > 0 ? i.interestRate.toFixed(2) + '% p.a.' : '—'}</td>
        <td>$${i.amountInvested.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td style="font-weight:700; color:var(--text-main);">$${i.currentValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        <td style="font-weight:600; color:hsl(var(--emerald-base));">${i.interestRate > 0 ? '$' + annualReturn.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) + '/yr' : '—'}</td>
        <td style="font-weight:600;" class="${diff >= 0 ? 'text-success' : 'text-danger'}">
          ${diff >= 0 ? '+' : ''}$${diff.toLocaleString(undefined, {maximumFractionDigits: 0})} (${Math.round(pct * 10) / 10}%)
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm revalue-inv-btn" 
            data-type="${i.type}" 
            data-cost="${i.amountInvested}" 
            data-val="${i.currentValue}" 
            data-rate="${i.interestRate || 0}" 
            data-tenure="${i.tenureMonths || 0}"
            data-date="${i.depositDate || ''}"
            data-notes="${i.notes || ''}" 
            style="padding:0.35rem 0.65rem; font-size:0.75rem;">Manage</button>
        </td>
      `;
      mapTarget.appendChild(tr);
    });

    // Bind Revalue Modals clicks
    document.querySelectorAll('.revalue-inv-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');

        if (type === 'Fixed Deposit (FD)') {
          document.getElementById('fd-new-date').value = formatDate(new Date());
          openModal('modal-manage-fds');
          syncFDManager();
          return;
        }

        if (type === 'Stocks' || type === 'Mutual Funds') {
          document.getElementById('asset-new-date').value = formatDate(new Date());
          openModal('modal-manage-assets');
          syncAssetsManager(type);
          return;
        }

        const costBasis = parseFloat(btn.getAttribute('data-cost'));
        const currentVal = parseFloat(btn.getAttribute('data-val'));
        const interestRate = parseFloat(btn.getAttribute('data-rate'));
        const tenure = parseInt(btn.getAttribute('data-tenure') || 0);
        const depDate = btn.getAttribute('data-date') || '';
        const notes = btn.getAttribute('data-notes');

        document.getElementById('revalue-type').value = type;
        document.getElementById('revalue-type-display').value = type;
        document.getElementById('revalue-invested-cost').value = costBasis;
        document.getElementById('revalue-funding-source').value = 'Existing Portfolio'; // Default to past asset

        const cash = window.FinanceDB.calculateCashBalance(state.token);
        document.getElementById('revalue-cash-helper').innerHTML = `Available Cash Balance: <strong>$${cash.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>`;
        document.getElementById('revalue-interest-rate').value = interestRate;
        document.getElementById('revalue-new-val').value = currentVal;
        document.getElementById('revalue-notes').value = notes;

        // FD Special fields wizard toggler
        const fdFields = document.getElementById('revalue-fd-fields');
        const tenureInput = document.getElementById('revalue-tenure');
        const dateInput = document.getElementById('revalue-deposit-date');

        if (type === 'Fixed Deposit (FD)') {
          fdFields.style.display = 'block';
          tenureInput.value = tenure > 0 ? tenure : '';
          dateInput.value = depDate || formatDate(new Date());

          // Real-time Calculator logic
          const updateFDCalc = () => {
            const principal = parseFloat(document.getElementById('revalue-invested-cost').value || 0);
            const rate = parseFloat(document.getElementById('revalue-interest-rate').value || 0);
            const mos = parseFloat(tenureInput.value || 0);
            const startD = dateInput.value;

            // Simple interest maturity: P * r * (t/365)
            const interest = principal * (rate / 100) * (mos / 365);
            const maturity = principal + interest;

            document.getElementById('revalue-calc-interest').textContent = `$${interest.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
            document.getElementById('revalue-calc-maturity').textContent = `$${maturity.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
            
            // Auto update valuation field with calculated maturity value to make it seamless
            document.getElementById('revalue-new-val').value = Math.round(maturity * 100) / 100;

            if (startD) {
              const d = new Date(startD);
              d.setDate(d.getDate() + parseInt(mos || 0));
              document.getElementById('revalue-calc-date').textContent = formatDate(d);
            } else {
              document.getElementById('revalue-calc-date').textContent = '—';
            }
          };

          // Attach listeners to trigger live calculators
          const inputs = ['revalue-invested-cost', 'revalue-interest-rate', 'revalue-tenure', 'revalue-deposit-date'];
          inputs.forEach(id => {
            const el = document.getElementById(id);
            el.removeEventListener('input', updateFDCalc);
            el.removeEventListener('change', updateFDCalc);
            el.addEventListener('input', updateFDCalc);
            el.addEventListener('change', updateFDCalc);
          });

          // Run one initial computation
          updateFDCalc();
        } else {
          fdFields.style.display = 'none';
        }

        openModal('modal-revalue-investment');
      });
    });

    // Render Transaction History logs for investments
    const txnTarget = document.getElementById('investment-txn-rows-target');
    txnTarget.innerHTML = '';
    
    // Sort transactions reverse-chronologically
    const allTxns = window.FinanceDB.tables.investmentTransactions
      .filter(t => t.userId === window.FinanceDB.tables.users[0].id) // Demo secure filter
      .sort((a,b) => b.date.localeCompare(a.date));

    if (allTxns.length === 0) {
      txnTarget.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-subtle);">No investment transactions logged.</td></tr>';
    } else {
      allTxns.forEach(t => {
        let badgeType = 'badge-muted';
        let flowStr = '';
        
        if (t.type === 'buy') {
          badgeType = 'badge-success';
          flowStr = `${t.fromType} ➔ ${t.toType}`;
        } else if (t.type === 'sell') {
          badgeType = 'badge-danger';
          flowStr = `${t.fromType} ➔ ${t.toType}`;
        } else if (t.type === 'repayment_allocation') {
          badgeType = 'badge-warning';
          flowStr = `Repayment ➔ ${t.toType}`;
        } else {
          // transfer
          badgeType = 'badge-success';
          flowStr = `${t.fromType} ➔ ${t.toType}`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${t.date}</td>
          <td><span class="badge ${badgeType}">${t.type}</span></td>
          <td style="font-family:var(--font-display); font-size:0.85rem;">${flowStr}</td>
          <td style="font-weight:700; font-family:var(--font-display);">$${t.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
          <td style="color:var(--text-muted); font-size:0.8rem;">${t.notes || '—'}</td>
        `;
        txnTarget.appendChild(tr);
      });
    }
  }

  // TRIGGER: Open transfer modal
  document.getElementById('btn-open-transfer-modal').addEventListener('click', () => {
    // Set default transfer date to today
    document.getElementById('transfer-date').value = formatDate(new Date());
    openModal('modal-transfer-assets');
  });

  // SUBMIT: Transfer Assets Form
  document.getElementById('modal-transfer-assets-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setGlobalLoader(true);

    const payload = {
      fromType: document.getElementById('transfer-from').value,
      toType: document.getElementById('transfer-to').value,
      amount: document.getElementById('transfer-amount').value,
      date: document.getElementById('transfer-date').value,
      notes: document.getElementById('transfer-notes').value
    };

    const res = await window.FinanceAPI.recordInvestmentTransfer(getHeaders(), payload);
    setGlobalLoader(false);

    if (res.success) {
      showToast(`Successfully transferred $${parseFloat(payload.amount).toLocaleString()} from ${payload.fromType} to ${payload.toType}.`, 'success');
      closeModal('modal-transfer-assets');
      document.getElementById('modal-transfer-assets-form').reset();
      syncInvestments();
    } else {
      showToast(res.error, 'error');
    }
  });

  // SUBMIT: Revalue Investment Form (Upgraded details manager)
  document.getElementById('modal-revalue-investment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setGlobalLoader(true);

    const payload = {
      type: document.getElementById('revalue-type').value,
      investedCost: document.getElementById('revalue-invested-cost').value,
      fundingSource: document.getElementById('revalue-funding-source').value,
      interestRate: document.getElementById('revalue-interest-rate').value,
      tenureMonths: document.getElementById('revalue-tenure').value,
      depositDate: document.getElementById('revalue-deposit-date').value,
      newValue: document.getElementById('revalue-new-val').value,
      notes: document.getElementById('revalue-notes').value
    };

    const res = await window.FinanceAPI.revalueInvestment(getHeaders(), payload);
    setGlobalLoader(false);

    if (res.success) {
      showToast(`Asset class ${payload.type} details successfully updated.`, 'success');
      closeModal('modal-revalue-investment');
      document.getElementById('modal-revalue-investment-form').reset();
      syncInvestments();
    } else {
      showToast(res.error, 'error');
    }
  });

  // -------------------------------------------------------------------------
  // 7.4.1 FIXED DEPOSITS SUB-LEDGER SERVICES & MANAGERS
  // -------------------------------------------------------------------------
  async function syncFDManager() {
    setGlobalLoader(true);
    const res = await window.FinanceAPI.getFixedDeposits(getHeaders());
    setGlobalLoader(false);

    const cash = window.FinanceDB.calculateCashBalance(state.token);
    const fdCashHelper = document.getElementById('fd-cash-helper');
    if (fdCashHelper) {
      fdCashHelper.innerHTML = `Available Cash Balance: <strong>$${cash.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>`;
    }

    const rowsTarget = document.getElementById('fd-ledger-rows-target');
    rowsTarget.innerHTML = '';

    if (res.success) {
      const list = res.data;
      if (list.length === 0) {
        rowsTarget.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1.5rem; color:var(--text-subtle);">No active Fixed Deposits logged.</td></tr>';
      } else {
        list.forEach(f => {
          const principal = parseFloat(f.principal || 0);
          const rate = parseFloat(f.interestRate || 0);
          const tenure = parseInt(f.tenureDays || 0);
          
          // Days Elapsed Calculation
          const start = new Date(f.depositDate);
          const today = new Date();
          start.setHours(0, 0, 0, 0);
          today.setHours(0, 0, 0, 0);
          const diffTime = today.getTime() - start.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          const daysCounted = Math.max(0, diffDays); // No upper cap: keeps growing indefinitely

          const interestEarned = principal * (rate / 100) * (daysCounted / 365);
          const interestEarnedRounded = Math.round(interestEarned * 100) / 100;
          const accruedValue = Math.round((principal + interestEarned) * 100) / 100;

          let actionBtn = '';
          if (f.status === 'Active') {
            actionBtn = `
              <button class="btn btn-secondary btn-sm edit-fd-btn" data-id="${f.id}" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; margin-right: 0.25rem;">Edit</button>
              <button class="btn btn-danger btn-sm liquidate-fd-btn" data-id="${f.id}" data-name="${f.name}" data-val="${accruedValue}" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; margin-right: 0.25rem;">Liquidate</button>
            `;
          } else {
            actionBtn = `<span class="badge badge-muted" style="margin-right: 0.25rem;">Closed</span>`;
          }
          actionBtn += `<button class="btn btn-danger btn-sm delete-fd-btn" data-id="${f.id}" data-name="${f.name}" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; border:none; background:hsl(var(--crimson-base));">✕</button>`;

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="font-weight:600; font-family:var(--font-display);">${f.name}</td>
            <td style="font-weight:700;">$${principal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="color:var(--text-muted); font-weight:600;">${rate.toFixed(2)}% p.a.</td>
            <td>${tenure} days</td>
            <td>${f.depositDate}</td>
            <td style="font-weight:700; color:var(--text-main);">$${accruedValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="font-weight:700; color:hsl(var(--emerald-base));">$${interestEarnedRounded.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="text-align: right;">${actionBtn}</td>
          `;
          rowsTarget.appendChild(tr);
        });

        // Bind edit button clicks
        document.querySelectorAll('.edit-fd-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const f = res.data.find(item => item.id === id);
            if (f) {
              document.getElementById('edit-fd-id').value = f.id;
              document.getElementById('edit-fd-name').value = f.name;
              document.getElementById('edit-fd-principal').value = f.principal;
              document.getElementById('edit-fd-rate').value = f.interestRate;
              document.getElementById('edit-fd-tenure').value = f.tenureDays;
              document.getElementById('edit-fd-date').value = f.depositDate;
              document.getElementById('edit-fd-source').value = f.fundingSource || 'Existing Portfolio';
              document.getElementById('edit-fd-notes').value = f.notes || '';

              const cash = window.FinanceDB.calculateCashBalance(state.token);
              document.getElementById('edit-fd-cash-helper').innerHTML = `Available Cash Balance: <strong>$${cash.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>`;

              openModal('modal-edit-fd');
            }
          });
        });

        // Bind delete button clicks
        document.querySelectorAll('.delete-fd-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            if (confirm(`Are you absolutely sure you want to delete Fixed Deposit "${name}"? This will cascade and wipe all associated initial buy and liquidation transaction logs.`)) {
              setGlobalLoader(true);
              const delRes = await window.FinanceAPI.deleteFixedDeposit(getHeaders(), id);
              setGlobalLoader(false);
              if (delRes.success) {
                showToast(`Fixed Deposit "${name}" successfully deleted.`, 'success');
                await syncFDManager();
                await syncInvestments();
              } else {
                showToast(delRes.error, 'error');
              }
            }
          });
        });

        // Bind liquidate button clicks
        document.querySelectorAll('.liquidate-fd-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            const val = parseFloat(btn.getAttribute('data-val'));

            document.getElementById('liquidate-fd-id').value = id;
            document.getElementById('liquidate-fd-name-display').value = name;
            document.getElementById('liquidate-fd-value-display').value = `$${val.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            document.getElementById('liquidate-fd-allocation').value = 'Cash Balance';

            openModal('modal-liquidate-fd');
          });
        });
      }
    } else {
      showToast(res.error, 'error');
    }
  }

  // Real-time Calculator for New Fixed Deposit opening form
  const updateNewFDCalc = () => {
    const principal = parseFloat(document.getElementById('fd-new-principal').value || 0);
    const rate = parseFloat(document.getElementById('fd-new-rate').value || 0);
    const tenure = parseFloat(document.getElementById('fd-new-tenure').value || 0);
    const startD = document.getElementById('fd-new-date').value;

    const interest = principal * (rate / 100) * (tenure / 365);
    const maturity = principal + interest;

    document.getElementById('fd-calc-interest').textContent = `$${interest.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('fd-calc-maturity').textContent = `$${maturity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

    if (startD) {
      const d = new Date(startD);
      d.setDate(d.getDate() + parseInt(tenure || 0));
      document.getElementById('fd-calc-date').textContent = formatDate(d);
    } else {
      document.getElementById('fd-calc-date').textContent = '—';
    }
  };

  // Attach event listeners to the fields in the add FD form for real-time calculations
  ['fd-new-principal', 'fd-new-rate', 'fd-new-tenure', 'fd-new-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateNewFDCalc);
      el.addEventListener('change', updateNewFDCalc);
    }
  });

  // SUBMIT: Open New Fixed Deposit Form
  const addFdForm = document.getElementById('modal-add-fd-form');
  if (addFdForm) {
    addFdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setGlobalLoader(true);

      const payload = {
        name: document.getElementById('fd-new-name').value,
        principal: document.getElementById('fd-new-principal').value,
        interestRate: document.getElementById('fd-new-rate').value,
        tenureDays: document.getElementById('fd-new-tenure').value,
        depositDate: document.getElementById('fd-new-date').value,
        fundingSource: document.getElementById('fd-new-source').value
      };

      const res = await window.FinanceAPI.addFixedDeposit(getHeaders(), payload);
      setGlobalLoader(false);

      if (res.success) {
        showToast(`Opened Fixed Deposit contract "${payload.name}" of $${parseFloat(payload.principal).toLocaleString()} successfully.`, 'success');
        addFdForm.reset();
        document.getElementById('fd-new-date').value = formatDate(new Date());
        document.getElementById('fd-new-source').value = 'Existing Portfolio';
        updateNewFDCalc();
        
        // Refresh FDs list and investments
        await syncFDManager();
        await syncInvestments();
      } else {
        showToast(res.error, 'error');
      }
    });
  }

  // SUBMIT: Liquidate/Mature Fixed Deposit Form
  const liquidateFdForm = document.getElementById('modal-liquidate-fd-form');
  if (liquidateFdForm) {
    liquidateFdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setGlobalLoader(true);

      const payload = {
        id: document.getElementById('liquidate-fd-id').value,
        allocationType: document.getElementById('liquidate-fd-allocation').value
      };

      const res = await window.FinanceAPI.closeFixedDeposit(getHeaders(), payload);
      setGlobalLoader(false);

      if (res.success) {
        showToast(`Fixed Deposit account liquidated. Capital routed into [${payload.allocationType}].`, 'success');
        closeModal('modal-liquidate-fd');
        liquidateFdForm.reset();
        
        // Refresh FDs list and investments
        await syncFDManager();
        await syncInvestments();
      } else {
        showToast(res.error, 'error');
      }
    });
  }

  // -------------------------------------------------------------------------
  // 7.4.2 STOCKS & MUTUAL FUNDS DYNAMIC SUB-LEDGERS SERVICES & MANAGERS
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // 7.4.2 STOCKS & MUTUAL FUNDS DYNAMIC SUB-LEDGERS SERVICES & MANAGERS
  // -------------------------------------------------------------------------
  async function syncAssetsManager(assetType) {
    setGlobalLoader(true);
    const res = await window.FinanceAPI.getAssetHoldings(getHeaders(), { assetType });
    setGlobalLoader(false);

    const cash = window.FinanceDB.calculateCashBalance(state.token);
    const assetCashHelper = document.getElementById('asset-cash-helper');
    if (assetCashHelper) {
      assetCashHelper.innerHTML = `Available Cash Balance: <strong>$${cash.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>`;
    }

    // Update dynamic texts
    document.getElementById('asset-ledger-title').textContent = `${assetType} Sub-Ledger Manager`;
    document.getElementById('asset-ledger-active-title').textContent = `Active ${assetType} Accounts / Holdings`;
    document.getElementById('asset-new-title').textContent = `Record New ${assetType} Holding`;
    document.getElementById('asset-ledger-type').value = assetType;

    const nameInput = document.getElementById('asset-new-name');
    nameInput.placeholder = assetType === 'Stocks' ? 'e.g. Apple Inc. (AAPL)' : 'e.g. Vanguard S&P 500 Index ETF';

    const rowsTarget = document.getElementById('asset-ledger-rows-target');
    rowsTarget.innerHTML = '';

    // Clear transaction history drawer on load
    document.getElementById('asset-history-table-container').style.display = 'none';
    document.getElementById('asset-history-helper-text').style.display = 'block';

    if (res.success) {
      const list = res.data;
      if (list.length === 0) {
        rowsTarget.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-subtle);">No active ${assetType} holdings logged.</td></tr>`;
      } else {
        list.forEach(h => {
          const principal = parseFloat(h.principal || 0);
          const currentVal = parseFloat(h.currentValue || 0);
          const rate = parseFloat(h.expectedReturnRate || 0);
          const diff = currentVal - principal;
          const pct = principal > 0 ? (diff / principal * 100) : 0;

          let actionBtn = '';
          if (h.status === 'Active') {
            actionBtn = `
              <button class="btn btn-secondary btn-sm edit-asset-btn" data-id="${h.id}" style="padding: 0.25rem 0.45rem; font-size: 0.7rem; margin-right: 0.25rem;">Edit</button>
              <button class="btn btn-success btn-sm topup-asset-btn" data-id="${h.id}" data-name="${h.name}" style="padding: 0.25rem 0.45rem; font-size: 0.7rem; margin-right: 0.25rem;">+ SIP</button>
              <button class="btn btn-danger btn-sm liquidate-asset-btn" data-id="${h.id}" data-name="${h.name}" data-val="${currentVal}" style="padding: 0.25rem 0.45rem; font-size: 0.7rem; margin-right: 0.25rem;">Sell</button>
            `;
          } else {
            actionBtn = `<span class="badge badge-muted" style="margin-right: 0.25rem;">Sold / Closed</span>`;
          }
          actionBtn += `<button class="btn btn-danger btn-sm delete-asset-btn" data-id="${h.id}" data-name="${h.name}" style="padding: 0.25rem 0.45rem; font-size: 0.7rem; border:none; background:hsl(var(--crimson-base));">✕</button>`;

          const tr = document.createElement('tr');
          tr.style.cursor = 'pointer';
          tr.innerHTML = `
            <td style="font-weight:600; font-family:var(--font-display);">${h.name}</td>
            <td style="font-weight:700;">$${principal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="font-weight:700; color:var(--text-main);">$${currentVal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
            <td style="color:var(--text-muted); font-weight:600;">${rate.toFixed(2)}% p.a.</td>
            <td>${h.buyDate}</td>
            <td style="font-weight:600;" class="${diff >= 0 ? 'text-success' : 'text-danger'}">
              ${diff >= 0 ? '+' : ''}$${diff.toLocaleString(undefined, {maximumFractionDigits: 0})} (${Math.round(pct * 10) / 10}%)
            </td>
            <td style="text-align: right;">${actionBtn}</td>
          `;

          // Add interactive row selection for transaction history drawer
          tr.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            document.querySelectorAll('#asset-ledger-rows-target tr').forEach(r => r.style.background = '');
            tr.style.background = 'var(--bg-card-hover)';
            showHoldingHistory(h);
          });

          rowsTarget.appendChild(tr);
        });

        // Bind edit holding button clicks
        document.querySelectorAll('.edit-asset-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const assetRec = res.data.find(item => item.id === id);
            if (assetRec) {
              document.getElementById('edit-asset-id').value = assetRec.id;
              document.getElementById('edit-asset-name').value = assetRec.name;
              document.getElementById('edit-asset-principal').value = assetRec.principal;
              document.getElementById('edit-asset-current-value').value = assetRec.currentValue;
              document.getElementById('edit-asset-rate').value = assetRec.expectedReturnRate;
              document.getElementById('edit-asset-date').value = assetRec.buyDate;
              document.getElementById('edit-asset-source').value = assetRec.fundingSource || 'Existing Portfolio';
              document.getElementById('edit-asset-notes').value = assetRec.notes || '';

              const cash = window.FinanceDB.calculateCashBalance(state.token);
              document.getElementById('edit-asset-cash-helper').innerHTML = `Available Cash Balance: <strong>$${cash.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>`;

              openModal('modal-edit-asset');
            }
          });
        });

        // Bind delete holding button clicks
        document.querySelectorAll('.delete-asset-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            if (confirm(`Are you absolutely sure you want to delete ${assetType} holding "${name}"? This will cascade and delete all associated buy, top-up (SIP), and liquidation transaction history.`)) {
              setGlobalLoader(true);
              const delRes = await window.FinanceAPI.deleteAssetHolding(getHeaders(), id);
              setGlobalLoader(false);
              if (delRes.success) {
                showToast(`Asset holding "${name}" successfully deleted.`, 'success');
                await syncAssetsManager(assetType);
                await syncInvestments();
              } else {
                showToast(delRes.error, 'error');
              }
            }
          });
        });

        // Bind liquidate button clicks
        document.querySelectorAll('.liquidate-asset-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            const val = parseFloat(btn.getAttribute('data-val'));

            document.getElementById('liquidate-asset-id').value = id;
            document.getElementById('liquidate-asset-name-display').value = name;
            document.getElementById('liquidate-asset-value').value = val;
            document.getElementById('liquidate-asset-allocation').value = 'Cash Balance';

            openModal('modal-liquidate-asset');
          });
        });

        // Bind top-up (SIP) button clicks
        document.querySelectorAll('.topup-asset-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');

            document.getElementById('topup-asset-id').value = id;
            document.getElementById('topup-asset-name-display').value = name;
            document.getElementById('topup-asset-amount').value = '';
            document.getElementById('topup-asset-notes').value = '';
            document.getElementById('topup-asset-date').value = formatDate(new Date());
            document.getElementById('topup-asset-source').value = 'Cash Balance'; // Default liquid for SIP

            const cash = window.FinanceDB.calculateCashBalance(state.token);
            const topupCashHelper = document.getElementById('topup-asset-cash-helper');
            if (topupCashHelper) {
              topupCashHelper.innerHTML = `Available Cash Balance: <strong>$${cash.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>`;
            }

            openModal('modal-topup-asset');
          });
        });
      }
    } else {
      showToast(res.error, 'error');
    }
  }

  // Helper to query and show transactions specifically linked relationally to this holding
  function showHoldingHistory(h) {
    const historyTarget = document.getElementById('asset-history-rows-target');
    historyTarget.innerHTML = '';

    const list = window.FinanceDB.tables.investmentTransactions
      .filter(t => t.holdingId === h.id)
      .sort((a, b) => b.date.localeCompare(a.date));

    document.getElementById('asset-history-helper-text').style.display = 'none';
    document.getElementById('asset-history-table-container').style.display = 'block';

    if (list.length === 0) {
      historyTarget.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1rem; color:var(--text-subtle);">No transactions logged for this holding.</td></tr>';
    } else {
      list.forEach(t => {
        let badge = 'badge-muted';
        let flow = '';
        if (t.type === 'buy') {
          badge = 'badge-success';
          flow = `${t.fromType} ➔ ${t.toType}`;
        } else if (t.type === 'sell') {
          badge = 'badge-danger';
          flow = `${t.fromType} ➔ ${t.toType}`;
        } else {
          badge = 'badge-success';
          flow = `${t.fromType} ➔ ${t.toType}`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${t.date}</td>
          <td><span class="badge ${badge}">${t.type}</span></td>
          <td style="font-size:0.75rem; font-family:var(--font-display);">${flow}</td>
          <td style="font-weight:700;">$${t.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
          <td style="color:var(--text-muted); font-size:0.75rem;">${t.notes || '—'}</td>
          <td style="text-align: right;">
            <button class="btn btn-danger btn-sm delete-holding-txn-btn" data-id="${t.id}" style="padding: 0.15rem 0.35rem; font-size: 0.65rem;">✕</button>
          </td>
        `;
        historyTarget.appendChild(tr);
      });

      // Bind delete holding transaction clicks
      document.querySelectorAll('.delete-holding-txn-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const txnId = btn.getAttribute('data-id');
          if (confirm('Delete this transaction log? Deleting an SIP top-up will dynamically subtract it from the parent holding principal/value and refund cash.')) {
            setGlobalLoader(true);
            const delRes = await window.FinanceAPI.deleteAssetTransaction(getHeaders(), { id: txnId });
            setGlobalLoader(false);
            if (delRes.success) {
              showToast('Transaction deleted successfully. Parent holdings adjusted.', 'success');
              
              // Refetch parent details to render properly
              const type = document.getElementById('asset-ledger-type').value;
              await syncAssetsManager(type);
              await syncInvestments();
            } else {
              showToast(delRes.error, 'error');
            }
          }
        });
      });
    }
  }

  // SUBMIT: Record New Asset Holding (Stocks/Mutual Funds)
  const addAssetForm = document.getElementById('modal-add-asset-form');
  if (addAssetForm) {
    addAssetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setGlobalLoader(true);

      const type = document.getElementById('asset-ledger-type').value;
      const payload = {
        assetType: type,
        name: document.getElementById('asset-new-name').value,
        principal: document.getElementById('asset-new-principal').value,
        currentValue: document.getElementById('asset-new-current-value').value,
        expectedReturnRate: document.getElementById('asset-new-rate').value,
        buyDate: document.getElementById('asset-new-date').value,
        fundingSource: document.getElementById('asset-new-source').value,
        notes: document.getElementById('asset-new-notes').value
      };

      const res = await window.FinanceAPI.addAssetHolding(getHeaders(), payload);
      setGlobalLoader(false);

      if (res.success) {
        showToast(`Recorded asset holding "${payload.name}" under [${type}] successfully.`, 'success');
        addAssetForm.reset();
        document.getElementById('asset-new-date').value = formatDate(new Date());
        document.getElementById('asset-new-source').value = 'Existing Portfolio';
        
        // Refresh sub-ledger list and investments overview
        await syncAssetsManager(type);
        await syncInvestments();
      } else {
        showToast(res.error, 'error');
      }
    });
  }

  // SUBMIT: Add SIP / Top-up Form
  const topupAssetForm = document.getElementById('modal-topup-asset-form');
  if (topupAssetForm) {
    topupAssetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setGlobalLoader(true);

      const type = document.getElementById('asset-ledger-type').value;
      const payload = {
        id: document.getElementById('topup-asset-id').value,
        amount: document.getElementById('topup-asset-amount').value,
        date: document.getElementById('topup-asset-date').value,
        fundingSource: document.getElementById('topup-asset-source').value,
        notes: document.getElementById('topup-asset-notes').value
      };

      const res = await window.FinanceAPI.topUpAssetHolding(getHeaders(), payload);
      setGlobalLoader(false);

      if (res.success) {
        showToast(`Processed SIP top-up of $${parseFloat(payload.amount).toLocaleString()} successfully.`, 'success');
        closeModal('modal-topup-asset');
        topupAssetForm.reset();

        // Refresh sub-ledger list and investments overview
        await syncAssetsManager(type);
        await syncInvestments();
      } else {
        showToast(res.error, 'error');
      }
    });
  }

  // SUBMIT: Liquidate/Sell Asset Holding (Stocks/Mutual Funds)
  const liquidateAssetForm = document.getElementById('modal-liquidate-asset-form');
  if (liquidateAssetForm) {
    liquidateAssetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setGlobalLoader(true);

      const type = document.getElementById('asset-ledger-type').value;
      const payload = {
        id: document.getElementById('liquidate-asset-id').value,
        newValue: document.getElementById('liquidate-asset-value').value,
        allocationType: document.getElementById('liquidate-asset-allocation').value
      };

      const res = await window.FinanceAPI.closeAssetHolding(getHeaders(), payload);
      setGlobalLoader(false);

      if (res.success) {
        showToast(`Asset holding successfully liquidated. Sale proceeds routed to [${payload.allocationType}].`, 'success');
        closeModal('modal-liquidate-asset');
        liquidateAssetForm.reset();
        
        // Refresh sub-ledger list and investments overview
        await syncAssetsManager(type);
        await syncInvestments();
      } else {
        showToast(res.error, 'error');
      }
    });
  }

  // SUBMIT: Edit Fixed Deposit Form
  const editFdForm = document.getElementById('modal-edit-fd-form');
  if (editFdForm) {
    editFdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setGlobalLoader(true);

      const payload = {
        id: document.getElementById('edit-fd-id').value,
        name: document.getElementById('edit-fd-name').value,
        principal: document.getElementById('edit-fd-principal').value,
        interestRate: document.getElementById('edit-fd-rate').value,
        tenureDays: document.getElementById('edit-fd-tenure').value,
        depositDate: document.getElementById('edit-fd-date').value,
        fundingSource: document.getElementById('edit-fd-source').value,
        notes: document.getElementById('edit-fd-notes').value
      };

      const res = await window.FinanceAPI.editFixedDeposit(getHeaders(), payload);
      setGlobalLoader(false);

      if (res.success) {
        showToast(`Fixed Deposit contract "${payload.name}" successfully updated.`, 'success');
        closeModal('modal-edit-fd');
        
        await syncFDManager();
        await syncInvestments();
      } else {
        showToast(res.error, 'error');
      }
    });
  }

  // SUBMIT: Edit Asset Holding Form
  const editAssetForm = document.getElementById('modal-edit-asset-form');
  if (editAssetForm) {
    editAssetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setGlobalLoader(true);

      const type = document.getElementById('asset-ledger-type').value;
      const payload = {
        id: document.getElementById('edit-asset-id').value,
        name: document.getElementById('edit-asset-name').value,
        principal: document.getElementById('edit-asset-principal').value,
        currentValue: document.getElementById('edit-asset-current-value').value,
        expectedReturnRate: document.getElementById('edit-asset-rate').value,
        buyDate: document.getElementById('edit-asset-date').value,
        fundingSource: document.getElementById('edit-asset-source').value,
        notes: document.getElementById('edit-asset-notes').value
      };

      const res = await window.FinanceAPI.editAssetHolding(getHeaders(), payload);
      setGlobalLoader(false);

      if (res.success) {
        showToast(`Asset holding "${payload.name}" successfully updated.`, 'success');
        closeModal('modal-edit-asset');
        
        await syncAssetsManager(type);
        await syncInvestments();
      } else {
        showToast(res.error, 'error');
      }
    });
  }

  // SUBMIT: Edit Expense Form
  const editExpenseForm = document.getElementById('modal-edit-expense-form');
  if (editExpenseForm) {
    editExpenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setGlobalLoader(true);

      const id = document.getElementById('edit-exp-id').value;
      const payload = {
        date: document.getElementById('edit-exp-date').value,
        category: document.getElementById('edit-exp-category').value,
        amount: document.getElementById('edit-exp-amount').value,
        description: document.getElementById('edit-exp-desc').value
      };

      const res = await window.FinanceAPI.editExpense(getHeaders(), id, payload);
      setGlobalLoader(false);

      if (res.success) {
        showToast('Expense transaction updated successfully.', 'success');
        closeModal('modal-edit-expense');
        
        await syncExpenses();
        // Recalculate balances inside dashboard summary!
        if (typeof syncDashboard === 'function') {
          await syncDashboard();
        }
      } else {
        showToast(res.error, 'error');
      }
    });
  }

  // -------------------------------------------------------------------------
  // 7.5 VIEW CORE: LOANS (LIABILITIES & RECEIVABLES)
  // -------------------------------------------------------------------------
  async function syncLoans() {
    // 1. Fetch Loans Taken
    const resTaken = await window.FinanceAPI.getLoansTaken(getHeaders());
    const takenTarget = document.getElementById('loans-taken-rows-target');
    takenTarget.innerHTML = '';

    if (resTaken.success) {
      const list = resTaken.data.loans;
      if (list.length === 0) {
        takenTarget.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1.5rem; color:var(--text-subtle);">No liabilities recorded yet.</td></tr>';
      } else {
        list.forEach(l => {
          const statusClass = l.status === 'Active' ? 'badge-danger' : 'badge-muted';
          const tr = document.createElement('tr');
          
          let actionButtons = '';
          if (l.status === 'Active') {
            actionButtons = `<button class="btn btn-primary btn-sm repay-taken-trigger-btn" data-id="${l.id}" data-lender="${l.lenderName}" data-left="${l.outstandingAmount}" style="padding:0.3rem 0.6rem; font-size:0.75rem;">Pay Debt</button>`;
          }
          // Append delete record button
          actionButtons += `<button class="btn btn-danger btn-sm delete-taken-btn" data-id="${l.id}" style="padding:0.3rem 0.6rem; font-size:0.75rem; margin-left:0.35rem;">✕</button>`;

          tr.innerHTML = `
            <td style="font-weight:600; font-family:var(--font-display);">${l.lenderName}</td>
            <td style="font-weight:700;">$${l.loanAmount.toLocaleString()}</td>
            <td>${l.dateTaken}</td>
            <td>${l.interestRate > 0 ? l.interestRate + '%' : 'Interest Free'}</td>
            <td style="font-weight:700; color:hsl(var(--crimson-base));">$${l.outstandingAmount.toLocaleString()}</td>
            <td><span class="badge ${statusClass}">${l.status}</span></td>
            <td style="color:var(--text-muted); font-size:0.8rem; max-width:180px; overflow:hidden; text-overflow:ellipsis;">${l.notes || '—'}</td>
            <td style="text-align: right;">${actionButtons}</td>
          `;
          takenTarget.appendChild(tr);
        });

        // Repay triggers
        document.querySelectorAll('.repay-taken-trigger-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const lender = btn.getAttribute('data-lender');
            const outstanding = parseFloat(btn.getAttribute('data-left'));

            document.getElementById('repay-taken-loan-id').value = id;
            document.getElementById('repay-taken-lender-name').value = lender;
            document.getElementById('repay-taken-amount').value = outstanding;
            document.getElementById('repay-taken-max-helper').textContent = `Max outstanding debt left: $${outstanding.toLocaleString()}`;
            document.getElementById('repay-taken-date').value = formatDate(new Date());

            openModal('modal-repay-taken');
          });
        });

        // Delete triggers
        document.querySelectorAll('.delete-taken-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (confirm('Delete this liability record permanently? Repayment audits will be wiped.')) {
              const id = btn.getAttribute('data-id');
              const delRes = await window.FinanceAPI.deleteLoanTaken(getHeaders(), id);
              if (delRes.success) {
                showToast('Liability record removed.', 'success');
                syncLoans();
              } else {
                showToast(delRes.error, 'error');
              }
            }
          });
        });
      }
    }

    // 2. Fetch Loans Given
    const resGiven = await window.FinanceAPI.getLoansGiven(getHeaders());
    const givenTarget = document.getElementById('loans-given-rows-target');
    givenTarget.innerHTML = '';

    if (resGiven.success) {
      const list = resGiven.data.loans;
      if (list.length === 0) {
        givenTarget.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-subtle);">No active lending receivables recorded.</td></tr>';
      } else {
        list.forEach(l => {
          const statusClass = l.status === 'Active' ? 'badge-warning' : 'badge-muted';
          const tr = document.createElement('tr');
          
          let actionButtons = '';
          if (l.status === 'Active') {
            actionButtons = `<button class="btn btn-success btn-sm repay-given-trigger-btn" data-id="${l.id}" data-borrower="${l.borrowerName}" data-left="${l.outstandingBalance}" style="padding:0.3rem 0.6rem; font-size:0.75rem;">Collect Cash</button>`;
          }
          actionButtons += `<button class="btn btn-danger btn-sm delete-given-btn" data-id="${l.id}" style="padding:0.3rem 0.6rem; font-size:0.75rem; margin-left:0.35rem;">✕</button>`;

          tr.innerHTML = `
            <td style="font-weight:600; font-family:var(--font-display);">${l.borrowerName}</td>
            <td style="font-weight:700;">$${l.amountGiven.toLocaleString()}</td>
            <td>${l.dateGiven}</td>
            <td style="font-weight:700; color:hsl(var(--amber-base));">$${l.outstandingBalance.toLocaleString()}</td>
            <td style="color:var(--text-muted); font-size:0.8rem;">${l.purpose}</td>
            <td><span class="badge ${statusClass}">${l.status}</span></td>
            <td style="text-align: right;">${actionButtons}</td>
          `;
          givenTarget.appendChild(tr);
        });

        // Collect repayment triggers
        document.querySelectorAll('.repay-given-trigger-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const borrower = btn.getAttribute('data-borrower');
            const outstanding = parseFloat(btn.getAttribute('data-left'));

            document.getElementById('repay-given-loan-id').value = id;
            document.getElementById('repay-given-borrower-name').value = borrower;
            document.getElementById('repay-given-amount').value = outstanding;
            document.getElementById('repay-given-max-helper').textContent = `Max outstanding pending: $${outstanding.toLocaleString()}`;
            document.getElementById('repay-given-date').value = formatDate(new Date());
            document.getElementById('repay-given-allocation').value = 'Cash Balance'; // default liquid routing

            openModal('modal-repay-given');
          });
        });

        // Delete triggers
        document.querySelectorAll('.delete-given-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (confirm('Delete this receivable record permanently? Repayment loops will break.')) {
              const id = btn.getAttribute('data-id');
              const delRes = await window.FinanceAPI.deleteLoanGiven(getHeaders(), id);
              if (delRes.success) {
                showToast('Lending record removed.', 'success');
                syncLoans();
              } else {
                showToast(delRes.error, 'error');
              }
            }
          });
        });
      }
    }
  }

  // TRIGGER: Add Loan Taken
  document.getElementById('btn-open-loan-taken-modal').addEventListener('click', () => {
    document.getElementById('taken-date').value = formatDate(new Date());
    openModal('modal-loan-taken');
  });

  // SUBMIT: Add Loan Taken Form
  document.getElementById('modal-loan-taken-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setGlobalLoader(true);

    const payload = {
      lenderName: document.getElementById('taken-lender').value,
      loanAmount: document.getElementById('taken-amount').value,
      dateTaken: document.getElementById('taken-date').value,
      interestRate: document.getElementById('taken-rate').value,
      notes: document.getElementById('taken-notes').value
    };

    const res = await window.FinanceAPI.addLoanTaken(getHeaders(), payload);
    setGlobalLoader(false);

    if (res.success) {
      showToast(`Recorded borrowed debt of $${parseFloat(payload.loanAmount).toLocaleString()} from ${payload.lenderName}.`, 'success');
      closeModal('modal-loan-taken');
      document.getElementById('modal-loan-taken-form').reset();
      syncLoans();
    } else {
      showToast(res.error, 'error');
    }
  });

  // TRIGGER: Add Loan Given
  document.getElementById('btn-open-loan-given-modal').addEventListener('click', () => {
    document.getElementById('given-date').value = formatDate(new Date());
    openModal('modal-loan-given');
  });

  // SUBMIT: Add Loan Given Form
  document.getElementById('modal-loan-given-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setGlobalLoader(true);

    const payload = {
      borrowerName: document.getElementById('given-borrower').value,
      amountGiven: document.getElementById('given-amount').value,
      date: document.getElementById('given-date').value,
      purpose: document.getElementById('given-purpose').value
    };

    const res = await window.FinanceAPI.addLoanGiven(getHeaders(), payload);
    setGlobalLoader(false);

    if (res.success) {
      showToast(`Recorded money lending of $${parseFloat(payload.amountGiven).toLocaleString()} to ${payload.borrowerName}.`, 'success');
      closeModal('modal-loan-given');
      document.getElementById('modal-loan-given-form').reset();
      syncLoans();
    } else {
      showToast(res.error, 'error');
    }
  });

  // SUBMIT: Repay Loan Taken (Paying debt)
  document.getElementById('modal-repay-taken-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setGlobalLoader(true);

    const payload = {
      loanId: document.getElementById('repay-taken-loan-id').value,
      amount: document.getElementById('repay-taken-amount').value,
      date: document.getElementById('repay-taken-date').value,
      notes: document.getElementById('repay-taken-notes').value
    };

    const res = await window.FinanceAPI.repayLoanTaken(getHeaders(), payload);
    setGlobalLoader(false);

    if (res.success) {
      showToast(`Processed debt repayment of $${parseFloat(payload.amount).toLocaleString()} to lender.`, 'success');
      closeModal('modal-repay-taken');
      document.getElementById('modal-repay-taken-form').reset();
      syncLoans();
    } else {
      showToast(res.error, 'error');
    }
  });

  // SUBMIT: Repay Loan Given (Collecting returned cash with Relational Allocations)
  document.getElementById('modal-repay-given-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setGlobalLoader(true);

    const payload = {
      loanId: document.getElementById('repay-given-loan-id').value,
      amount: document.getElementById('repay-given-amount').value,
      date: document.getElementById('repay-given-date').value,
      allocationType: document.getElementById('repay-given-allocation').value,
      notes: document.getElementById('repay-given-notes').value
    };

    const res = await window.FinanceAPI.repayLoanGiven(getHeaders(), payload);
    setGlobalLoader(false);

    if (res.success) {
      showToast(`Lent capital of $${parseFloat(payload.amount).toLocaleString()} collected and routed into [${payload.allocationType}]. Relational records & audit trails initialized.`, 'success');
      closeModal('modal-repay-given');
      document.getElementById('modal-repay-given-form').reset();
      syncLoans();
    } else {
      showToast(res.error, 'error');
    }
  });

  // -------------------------------------------------------------------------
  // 7.6 VIEW CORE: REPORTS
  // -------------------------------------------------------------------------
  async function syncReports() {
    const res = await window.FinanceAPI.getReports(getHeaders());
    if (!res.success) return showToast(res.error, 'error');

    const d = res.data;
    const isDark = state.currentTheme === 'dark';

    // RENDER CHART 4: Monthly Income vs Expenses
    cleanChart('reportsIncomeExpense');
    
    const monthsKeys = Object.keys(d.monthlyData).sort();
    let incomeValues = monthsKeys.map(m => d.monthlyData[m].income);
    let expenseValues = monthsKeys.map(m => d.monthlyData[m].expense);
    let labelsFormatted = monthsKeys.map(m => {
      const parts = m.split('-');
      const dObj = new Date(parts[0], parts[1]-1);
      return dObj.toLocaleString('default', { month: 'short' }) + ' ' + parts[0].substring(2);
    });

    // Provide default gorgeous sets if records are thin
    if (monthsKeys.length === 0) {
      labelsFormatted = ['Jan 26', 'Feb 26', 'Mar 26', 'Apr 26', 'May 26'];
      incomeValues = [4000, 4800, 5200, 6000, 8500];
      expenseValues = [2800, 3100, 2900, 3500, 4200];
    }

    const ctxIE = document.getElementById('chart-reports-income-expense').getContext('2d');
    
    state.charts.reportsIncomeExpense = new Chart(ctxIE, {
      type: 'bar',
      data: {
        labels: labelsFormatted,
        datasets: [
          {
            label: 'Inflow (Income) ($)',
            data: incomeValues,
            backgroundColor: 'rgba(16, 185, 129, 0.75)',
            borderColor: '#10b981',
            borderWidth: 1.5,
            borderRadius: 5
          },
          {
            label: 'Outflow (Expenses) ($)',
            data: expenseValues,
            backgroundColor: 'rgba(244, 63, 94, 0.75)',
            borderColor: '#f43f5e',
            borderWidth: 1.5,
            borderRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: isDark ? '#ddd' : '#555', font: { family: 'Outfit' } } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: isDark ? '#888' : '#666', font: { family: 'Outfit' } } },
          y: { grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }, ticks: { color: isDark ? '#888' : '#666', font: { family: 'Outfit' } } }
        }
      }
    });

    // RENDER CHART 5: Reports Net Worth projection
    cleanChart('reportsNetWorth');

    const nwMonths = d.netWorthTrend.map(t => {
      const parts = t.month.split('-');
      const dObj = new Date(parts[0], parts[1]-1);
      return dObj.toLocaleString('default', { month: 'short' });
    });
    const nwValues = d.netWorthTrend.map(t => t.netWorth);

    const ctxNW = document.getElementById('chart-reports-networth-trend').getContext('2d');
    const gradNW = ctxNW.createLinearGradient(0, 0, 0, 300);
    gradNW.addColorStop(0, 'rgba(136, 93, 242, 0.45)');
    gradNW.addColorStop(1, 'rgba(136, 93, 242, 0)');

    state.charts.reportsNetWorth = new Chart(ctxNW, {
      type: 'line',
      data: {
        labels: nwMonths,
        datasets: [{
          label: 'Total Net Worth ($)',
          data: nwValues,
          borderColor: '#885df2',
          borderWidth: 4,
          backgroundColor: gradNW,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#885df2',
          pointHoverRadius: 9,
          pointRadius: 4.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: isDark ? '#888' : '#666', font: { family: 'Outfit' } } },
          y: { grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }, ticks: { color: isDark ? '#888' : '#666', font: { family: 'Outfit' } } }
        }
      }
    });

    // Active Owed lists
    const tListEl = document.getElementById('report-loans-taken-list');
    tListEl.innerHTML = '';
    if (d.activeLoansTaken.length === 0) {
      tListEl.innerHTML = '<div class="text-muted" style="font-size:0.8rem; padding:0.5rem 0;">No active debt. Good job!</div>';
    } else {
      d.activeLoansTaken.forEach(l => {
        const item = document.createElement('div');
        item.className = 'audit-item';
        item.style.padding = '0.65rem 0.85rem';
        item.innerHTML = `
          <div class="audit-marker audit-outflow"></div>
          <div class="audit-item-body">
            <span style="font-weight:600;">${l.name}</span>
            <span style="font-size:0.75rem; color:var(--text-subtle);">Owed: $${l.amount.toLocaleString()} / Borrowed: $${l.total.toLocaleString()}</span>
          </div>
        `;
        tListEl.appendChild(item);
      });
    }

    // Active Lent lists
    const gListEl = document.getElementById('report-loans-given-list');
    gListEl.innerHTML = '';
    if (d.activeLoansGiven.length === 0) {
      gListEl.innerHTML = '<div class="text-muted" style="font-size:0.8rem; padding:0.5rem 0;">No outstanding loans lent.</div>';
    } else {
      d.activeLoansGiven.forEach(l => {
        const item = document.createElement('div');
        item.className = 'audit-item';
        item.style.padding = '0.65rem 0.85rem';
        item.innerHTML = `
          <div class="audit-marker audit-pending"></div>
          <div class="audit-item-body">
            <span style="font-weight:600;">${l.name}</span>
            <span style="font-size:0.75rem; color:var(--text-subtle);">Outstanding: $${l.amount.toLocaleString()} / Lent: $${l.total.toLocaleString()}</span>
          </div>
        `;
        gListEl.appendChild(item);
      });
    }

    // Yield rates mapping
    const yieldTarget = document.getElementById('report-yield-rows-target');
    yieldTarget.innerHTML = '';

    d.growthList.forEach(g => {
      if (g.invested === 0) return; // Only display asset classes with investments
      const yields = document.createElement('tr');
      yields.innerHTML = `
        <td style="font-weight:600; font-family:var(--font-display);">${g.type}</td>
        <td>$${g.invested.toLocaleString()}</td>
        <td style="font-weight:700;">$${g.value.toLocaleString()}</td>
        <td class="${g.growth >= 0 ? 'text-success' : 'text-danger'}" style="font-weight:600;">
          ${g.growth >= 0 ? '+' : ''}$${g.growth.toLocaleString()}
        </td>
        <td>
          <span class="badge ${g.growth >= 0 ? 'badge-success' : 'badge-danger'}" style="font-weight:700;">
            ${g.growth >= 0 ? '+' : ''}${g.percent}%
          </span>
        </td>
      `;
      yieldTarget.appendChild(yields);
    });

    if (yieldTarget.innerHTML === '') {
      yieldTarget.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-subtle);">Asset portfolio is currently empty. Deployed capital to calculate dynamic yields.</td></tr>';
    }
  }

  // -------------------------------------------------------------------------
  // 7.7 VIEW CORE: SETTINGS
  // -------------------------------------------------------------------------
  async function syncSettings() {
    // Synchronize Opening cash balance
    const userRow = window.FinanceDB.tables.users.find(u => u.id === state.token);
    if (userRow) {
      document.getElementById('settings-opening-balance').value = userRow.openingBalance;
    }

    // Synchronize Cloud Sync fields
    const syncKey = await window.FinanceAPI.getSyncKey(getHeaders());
    const syncKeyInput = document.getElementById('settings-sync-key');
    const syncStatusBadge = document.getElementById('sync-status-badge');
    const enableSyncBtn = document.getElementById('btn-enable-sync');
    const pushBtn = document.getElementById('btn-force-push');
    const pullBtn = document.getElementById('btn-force-pull');
    
    if (syncKey.success && syncKey.data) {
      syncKeyInput.value = syncKey.data;
      syncStatusBadge.textContent = 'Active / Syncing';
      syncStatusBadge.style.background = 'hsl(var(--emerald-base))';
      enableSyncBtn.textContent = 'Disable Cloud Sync';
      enableSyncBtn.style.background = 'hsl(var(--crimson-base))';
      pushBtn.style.display = 'inline-flex';
      pullBtn.style.display = 'inline-flex';
    } else {
      syncKeyInput.value = '';
      syncStatusBadge.textContent = 'Offline / Not Syncing';
      syncStatusBadge.style.background = 'hsl(0, 80%, 45%)';
      enableSyncBtn.textContent = 'Enable Cloud Sync';
      enableSyncBtn.style.background = 'hsl(var(--primary-base))';
      pushBtn.style.display = 'none';
      pullBtn.style.display = 'none';
    }

    // Complete Audit Ledger render
    const fullAuditTarget = document.getElementById('settings-audit-feed-complete');
    fullAuditTarget.innerHTML = '';

    const allAudits = await window.FinanceAPI.getAuditTrail(getHeaders());
    if (allAudits.success) {
      const list = allAudits.data;
      if (list.length === 0) {
        fullAuditTarget.innerHTML = '<div class="text-muted" style="text-align:center; padding:2rem;">Audit database is empty.</div>';
      } else {
        list.forEach(a => {
          const item = document.createElement('div');
          item.className = 'audit-item';
          
          let typeClass = 'audit-transfer';
          if (a.actionType.includes('INCOME')) typeClass = 'audit-inflow';
          else if (a.actionType.includes('EXPENSE')) typeClass = 'audit-outflow';
          else if (a.actionType.includes('REPAYMENT') || a.actionType.includes('LOAN')) typeClass = 'audit-pending';

          item.innerHTML = `
            <div class="audit-marker ${typeClass}"></div>
            <div class="audit-item-body" style="width:100%;">
              <span class="audit-msg" style="font-weight:500;">${a.message}</span>
              <div class="audit-meta">
                <span>Date Logged: ${a.date}</span>
                <span>•</span>
                <span>Action Code: ${a.actionType}</span>
              </div>
            </div>
          `;
          fullAuditTarget.appendChild(item);
        });
      }
    }
  }

  // SUBMIT: Update opening balance Settings
  document.getElementById('settings-cash-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setGlobalLoader(true);

    const amount = document.getElementById('settings-opening-balance').value;
    const res = await window.FinanceAPI.updateOpeningBalance(getHeaders(), { amount });
    setGlobalLoader(false);

    if (res.success) {
      showToast('Opening Cash balance updated. Recalculating net worth cascades.', 'success');
      syncSettings();
    } else {
      showToast(res.error, 'error');
    }
  });

  // DOWNLOAD: Portable JSON Database backups
  document.getElementById('btn-export-database').addEventListener('click', async () => {
    setGlobalLoader(true);
    const res = await window.FinanceAPI.exportDatabase(getHeaders());
    setGlobalLoader(false);

    if (res.success) {
      const jsonStr = JSON.stringify(res.data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `aurafinance_backup_${state.username}_${formatDate(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('System Backup downloaded successfully. Keep this file safe!', 'success');
    } else {
      showToast(res.error, 'error');
    }
  });

  // UPLOAD: Restore Backup utilities
  document.getElementById('settings-import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const contents = evt.target.result;
      setGlobalLoader(true);
      
      const res = await window.FinanceAPI.importDatabase(getHeaders(), contents);
      setGlobalLoader(false);

      if (res.success) {
        showToast('Database successfully restored from backup! Restarting dashboard routers.', 'success');
        // Reset input element
        e.target.value = '';
        router('#/dashboard');
      } else {
        showToast(res.error, 'error');
      }
    };
    reader.readAsText(file);
  });

  // TRIGGER: Factory database resets
  document.getElementById('btn-wipe-database').addEventListener('click', async () => {
    if (confirm('CRITICAL WARNING: This completely wipes all your incomes, expenses, investment logs, active liabilities, audit trail logs, and resets your cash assets to zero. This action CANNOT be undone. Proceed?')) {
      if (confirm('SECOND CONFIRMATION: Are you absolutely certain you want to wipe your local database?')) {
        setGlobalLoader(true);
        const res = await window.FinanceAPI.clearDatabase(getHeaders());
        setGlobalLoader(false);

        if (res.success) {
          showToast('Database reset complete. All logs purged.', 'warning');
          router('#/dashboard');
        } else {
          showToast(res.error, 'error');
        }
      }
    }
  });

  // BINDINGS: Cloud Sync Listeners
  document.getElementById('btn-enable-sync').addEventListener('click', async () => {
    const syncKeyInput = document.getElementById('settings-sync-key');
    const activeKey = syncKeyInput.value.trim();
    const isEnabling = document.getElementById('btn-enable-sync').textContent.includes('Enable');
    
    setGlobalLoader(true);
    if (isEnabling) {
      if (!activeKey) {
        setGlobalLoader(false);
        return showToast('Please enter a secret Sync Key first.', 'error');
      }
      await window.FinanceAPI.setSyncKey(getHeaders(), activeKey);
      
      // Try to push to initialize the cloud
      try {
        await window.FinanceAPI.pushToCloud(getHeaders());
        showToast('Cloud Sync enabled! Local database successfully pushed to cloud.', 'success');
      } catch (e) {
        showToast('Cloud Sync enabled locally, but initial cloud push failed. It will retry automatically.', 'warning');
      }
    } else {
      await window.FinanceAPI.setSyncKey(getHeaders(), '');
      showToast('Cloud Sync disabled. Your data is strictly offline locally.', 'info');
    }
    setGlobalLoader(false);
    await syncSettings();
  });

  document.getElementById('btn-force-push').addEventListener('click', async () => {
    setGlobalLoader(true);
    try {
      await window.FinanceAPI.pushToCloud(getHeaders());
      showToast('Successfully forced push local database to cloud.', 'success');
    } catch(e) {
      showToast('Force push failed: ' + e.message, 'error');
    }
    setGlobalLoader(false);
  });

  document.getElementById('btn-force-pull').addEventListener('click', async () => {
    if (confirm('CRITICAL: This will overwrite your current local database with the cloud database. Proceed?')) {
      setGlobalLoader(true);
      try {
        await window.FinanceAPI.pullFromCloud(getHeaders());
        showToast('Successfully pulled database from cloud! Refreshing dashboard.', 'success');
        router('#/dashboard');
      } catch(e) {
        showToast('Force pull failed: ' + e.message, 'error');
      }
      setGlobalLoader(false);
    }
  });

  // =========================================================================
  // 8. SESSION STARTUP INITIALIZER
  // =========================================================================
  checkSession();
});

// Utility Date helper
function formatDate(date) {
  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  const year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
}
