<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { auth, db } from '$lib/firebase/firebase';
	import { onAuthStateChanged, type User } from '@firebase/auth';
	import { 
		collection, 
		query, 
		where, 
		onSnapshot, 
		type DocumentData,
		Timestamp,
		doc,
		getDoc
	} from 'firebase/firestore';
	import Sidebar from '../../sections/Sidebar.svelte';
	import Chart from 'chart.js/auto';

	// User state
	let user: User | null = null;
	let userCurrency = 'INR';

	// Analytics state
	let transactions: DocumentData[] = [];
	let isLoading = true;
	let errorMessage = '';

	// Mobile state
	let isMobile = false;

	// Analytics data
	let metrics: any = null;
	let categoryData: any = null;

	// Chart instances
	let monthlyTrendChart: Chart | null = null;
	let categoryChart: Chart | null = null;
	let weeklyPatternChart: Chart | null = null;
	let incomeExpenseChart: Chart | null = null;

	// Currency symbols
	const currencySymbols: { [key: string]: string } = {
		'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥',
		'CAD': 'C$', 'AUD': 'A$', 'INR': '₹', 'CNY': '¥',
		'CHF': 'CHF', 'BTC': '₿', 'ETH': 'Ξ'
	};

	// Available categories
	const categories = [
		'Food & Dining',
		'Transportation',
		'Entertainment',
		'Shopping',
		'Bills & Utilities',
		'Healthcare',
		'Education',
		'Travel',
		'Income',
		'Other'
	];

	// Check screen size
	function checkScreenSize() {
		isMobile = window.innerWidth < 1024;
	}

	// Load user currency preference
	async function loadUserCurrency() {
		if (!user) return;
		
		try {
			const userDoc = await getDoc(doc(db, 'users', user.uid));
			if (userDoc.exists()) {
				const userData = userDoc.data();
				userCurrency = userData.currency || 'INR';
			}
		} catch (error) {
			console.error('Error loading user currency:', error);
		}
	}

	// Get currency symbol
	function getCurrencySymbol(currencyCode: string): string {
		return currencySymbols[currencyCode] || currencyCode;
	}

	// Load transactions from Firestore
	function loadTransactions() {
		if (!user) return;

		isLoading = true;
		const transactionsRef = collection(db, 'users', user.uid, 'transactions');
		const q = query(transactionsRef);

		const unsubscribe = onSnapshot(q, 
			(snapshot) => {
				transactions = snapshot.docs.map(doc => ({ 
					id: doc.id, 
					...doc.data() 
				}));
				// Calculate metrics and data
				metrics = calculateMetrics();
				categoryData = aggregateByCategory();
				isLoading = false;
				// Create charts after data is loaded
				setTimeout(() => {
					createCharts();
				}, 100);
			},
			(error) => {
				console.error('Error loading transactions:', error);
				errorMessage = 'Failed to load analytics data. Please try again.';
				isLoading = false;
			}
		);

		return unsubscribe;
	}

	// Data aggregation functions
	function aggregateMonthlySpending() {
		const monthlyData: { [key: string]: number } = {};
		const last6Months = getLast6Months();

		// Initialize last 6 months with 0
		last6Months.forEach(month => {
			monthlyData[month] = 0;
		});

		transactions.forEach(transaction => {
			if (transaction.type === 'expense') {
				const date = transaction.date.toDate();
				const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
				
				if (monthlyData[monthYear] !== undefined) {
					monthlyData[monthYear] += Math.abs(transaction.amount);
				}
			}
		});

		return {
			labels: last6Months.map(month => formatMonthLabel(month)),
			data: last6Months.map(month => monthlyData[month])
		};
	}

	function aggregateByCategory() {
		const categoryData: { [key: string]: number } = {};

		transactions
			.filter(t => t.type === 'expense')
			.forEach(transaction => {
				const category = transaction.category || 'Other';
				categoryData[category] = (categoryData[category] || 0) + Math.abs(transaction.amount);
			});

		const sortedCategories = Object.entries(categoryData)
			.sort(([,a], [,b]) => b - a)
			.slice(0, 8); // Top 8 categories

		return {
			labels: sortedCategories.map(([category]) => category),
			data: sortedCategories.map(([,amount]) => amount)
		};
	}

	function aggregateWeeklyPattern() {
		const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const dayData = [0, 0, 0, 0, 0, 0, 0];

		transactions
			.filter(t => t.type === 'expense')
			.forEach(transaction => {
				const date = transaction.date.toDate();
				const dayOfWeek = date.getDay();
				dayData[dayOfWeek] += Math.abs(transaction.amount);
			});

		return {
			labels: days,
			data: dayData
		};
	}

	function aggregateIncomeVsExpenses() {
		const monthlyData: { [key: string]: { income: number, expenses: number } } = {};
		const last6Months = getLast6Months();

		// Initialize last 6 months
		last6Months.forEach(month => {
			monthlyData[month] = { income: 0, expenses: 0 };
		});

		transactions.forEach(transaction => {
			const date = transaction.date.toDate();
			const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			
			if (monthlyData[monthYear]) {
				if (transaction.type === 'income') {
					monthlyData[monthYear].income += Math.abs(transaction.amount);
				} else {
					monthlyData[monthYear].expenses += Math.abs(transaction.amount);
				}
			}
		});

		return {
			labels: last6Months.map(month => formatMonthLabel(month)),
			income: last6Months.map(month => monthlyData[month].income),
			expenses: last6Months.map(month => monthlyData[month].expenses)
		};
	}

	// Helper functions
	function getLast6Months(): string[] {
		const months = [];
		const today = new Date();
		
		for (let i = 5; i >= 0; i--) {
			const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
			const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			months.push(monthYear);
		}
		
		return months;
	}

	function formatMonthLabel(monthYear: string): string {
		const [year, month] = monthYear.split('-');
		const date = new Date(parseInt(year), parseInt(month) - 1);
		return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
	}

	// Chart creation functions
	function createCharts() {
		destroyCharts(); // Clean up existing charts

		if (transactions.length === 0) return;

		// Monthly Trend Chart (Bar Chart)
		const monthlyData = aggregateMonthlySpending();
		const monthlyTrendCtx = document.getElementById('monthlyTrendChart') as HTMLCanvasElement;
		if (monthlyTrendCtx) {
			monthlyTrendChart = new Chart(monthlyTrendCtx, {
				type: 'bar',
				data: {
					labels: monthlyData.labels,
					datasets: [{
						label: `Monthly Spending (${getCurrencySymbol(userCurrency)})`,
						data: monthlyData.data,
						backgroundColor: 'rgba(255, 62, 0, 0.8)',
						borderColor: 'rgba(255, 62, 0, 1)',
						borderWidth: 1,
						borderRadius: 4
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							display: false
						},
						title: {
							display: true,
							text: 'Monthly Spending Trend',
							color: '#fff',
							font: {
								size: isMobile ? 14 : 16
							}
						}
					},
					scales: {
						y: {
							beginAtZero: true,
							ticks: {
								color: '#888',
								callback: function(value) {
									return getCurrencySymbol(userCurrency) + value;
								}
							},
							grid: {
								color: '#333'
							}
						},
						x: {
							ticks: {
								color: '#888'
							},
							grid: {
								color: '#333'
							}
						}
					}
				}
			});
		}

		// Category Breakdown (Doughnut Chart)
		const categoryDataAgg = aggregateByCategory();
		const categoryCtx = document.getElementById('categoryChart') as HTMLCanvasElement;
		if (categoryCtx && categoryDataAgg.labels.length > 0) {
			categoryChart = new Chart(categoryCtx, {
				type: 'doughnut',
				data: {
					labels: categoryDataAgg.labels,
					datasets: [{
						data: categoryDataAgg.data,
						backgroundColor: [
							'#ff3e00', '#ff6a33', '#ff955c', '#ffbf85',
							'#3298dc', '#51cf66', '#fcc419', '#be4bdb'
						],
						borderColor: '#1a1a1a',
						borderWidth: 2
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							position: isMobile ? 'bottom' : 'right',
							labels: {
								color: '#fff',
								font: {
									size: isMobile ? 10 : 12
								}
							}
						},
						title: {
							display: true,
							text: 'Spending by Category',
							color: '#fff',
							font: {
								size: isMobile ? 14 : 16
							}
						},
						tooltip: {
							callbacks: {
								label: function(context) {
									const label = context.label || '';
									const value = context.parsed as number;
									const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
									const percentage = Math.round((value / total) * 100);
									return `${label}: ${getCurrencySymbol(userCurrency)}${value.toFixed(2)} (${percentage}%)`;
								}
							}
						}
					}
				}
			});
		}

		// Weekly Pattern (Bar Chart)
		const weeklyData = aggregateWeeklyPattern();
		const weeklyCtx = document.getElementById('weeklyPatternChart') as HTMLCanvasElement;
		if (weeklyCtx) {
			weeklyPatternChart = new Chart(weeklyCtx, {
				type: 'bar',
				data: {
					labels: weeklyData.labels,
					datasets: [{
						label: `Average Spending (${getCurrencySymbol(userCurrency)})`,
						data: weeklyData.data,
						backgroundColor: 'rgba(32, 156, 238, 0.8)',
						borderColor: 'rgba(32, 156, 238, 1)',
						borderWidth: 1,
						borderRadius: 4
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: {
							display: false
						},
						title: {
							display: true,
							text: 'Weekly Spending Pattern',
							color: '#fff',
							font: {
								size: isMobile ? 14 : 16
							}
						}
					},
					scales: {
						y: {
							beginAtZero: true,
							ticks: {
								color: '#888',
								callback: function(value) {
									return getCurrencySymbol(userCurrency) + value;
								}
							},
							grid: {
								color: '#333'
							}
						},
						x: {
							ticks: {
								color: '#888'
							},
							grid: {
								color: '#333'
							}
						}
					}
				}
			});
		}

		// Income vs Expenses (Line Chart)
		const incomeExpenseData = aggregateIncomeVsExpenses();
		const incomeExpenseCtx = document.getElementById('incomeExpenseChart') as HTMLCanvasElement;
		if (incomeExpenseCtx) {
			incomeExpenseChart = new Chart(incomeExpenseCtx, {
				type: 'line',
				data: {
					labels: incomeExpenseData.labels,
					datasets: [
						{
							label: 'Income',
							data: incomeExpenseData.income,
							borderColor: '#51cf66',
							backgroundColor: 'rgba(81, 207, 102, 0.1)',
							tension: 0.4,
							fill: true
						},
						{
							label: 'Expenses',
							data: incomeExpenseData.expenses,
							borderColor: '#ff6b6b',
							backgroundColor: 'rgba(255, 107, 107, 0.1)',
							tension: 0.4,
							fill: true
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						title: {
							display: true,
							text: 'Income vs Expenses',
							color: '#fff',
							font: {
								size: isMobile ? 14 : 16
							}
						},
						legend: {
							labels: {
								color: '#fff',
								font: {
									size: isMobile ? 10 : 12
								}
							}
						}
					},
					scales: {
						y: {
							beginAtZero: true,
							ticks: {
								color: '#888',
								callback: function(value) {
									return getCurrencySymbol(userCurrency) + value;
								}
							},
							grid: {
								color: '#333'
							}
						},
						x: {
							ticks: {
								color: '#888'
							},
							grid: {
								color: '#333'
							}
						}
					}
				}
			});
		}
	}

	// Clean up chart instances
	function destroyCharts() {
		[monthlyTrendChart, categoryChart, weeklyPatternChart, incomeExpenseChart].forEach(chart => {
			if (chart) {
				chart.destroy();
			}
		});
	}

	// Calculate key metrics
	function calculateMetrics() {
		const totalIncome = transactions
			.filter(t => t.type === 'income')
			.reduce((sum, t) => sum + Math.abs(t.amount), 0);

		const totalExpenses = transactions
			.filter(t => t.type === 'expense')
			.reduce((sum, t) => sum + Math.abs(t.amount), 0);

		const netSavings = totalIncome - totalExpenses;
		const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

		const currentMonth = new Date().getMonth();
		const currentYear = new Date().getFullYear();
		const thisMonthSpending = transactions
			.filter(t => {
				const date = t.date.toDate();
				return t.type === 'expense' && 
					date.getMonth() === currentMonth && 
					date.getFullYear() === currentYear;
			})
			.reduce((sum, t) => sum + Math.abs(t.amount), 0);

		return {
			totalIncome,
			totalExpenses,
			netSavings,
			savingsRate: Math.round(savingsRate),
			thisMonthSpending
		};
	}

	onMount(() => {
		// Check initial screen size
		checkScreenSize();
		window.addEventListener('resize', checkScreenSize);

		const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
			user = currentUser;
			if (user) {
				loadUserCurrency();
				loadTransactions();
			} else {
				transactions = [];
				isLoading = false;
			}
		});

		return () => {
			unsubscribe();
			destroyCharts();
			window.removeEventListener('resize', checkScreenSize);
		};
	});
</script>

<svelte:head>
	<title>Analytics - Kash</title>
</svelte:head>

<section class="section">
	<div class="container">
		<div class="columns">
			<!-- Sidebar - Hidden on mobile -->
			{#if !isMobile}
				<Sidebar />
			{/if}

			<!-- Main Content -->
			<div class="column {isMobile ? 'is-12' : 'is-9'}">
				<!-- Mobile Header -->
				{#if isMobile}
					<div class="mobile-header box has-background-grey-darker mb-4">
						<div class="level is-mobile">
							<div class="level-left">
								<h1 class="title is-4 has-text-white mb-0">Analytics</h1>
							</div>
							<div class="level-right">
								<a href="/Add-Data" class="button is-warning is-small">
									<span class="icon">➕</span>
								</a>
							</div>
						</div>
					</div>
				{/if}

				<div class="box has-background-grey-darker">
					{#if !isMobile}
						<h1 class="title is-2 has-text-white mb-6">Analytics Dashboard</h1>
					{/if}

					<!-- Error Message -->
					{#if errorMessage}
						<div class="notification is-danger">
							<button class="delete" on:click={() => errorMessage = ''}></button>
							{errorMessage}
						</div>
					{/if}

					<!-- Key Metrics -->
					{#if !isLoading && transactions.length > 0 && metrics}
						<div class="columns is-mobile has-text-centered mb-6">
							<div class="column {isMobile ? 'is-6' : ''}">
								<div class="box has-background-success-light">
									<p class="title {isMobile ? 'is-6' : 'is-5'} has-text-success">
										{getCurrencySymbol(userCurrency)}{isMobile ? metrics.totalIncome.toFixed(0) : metrics.totalIncome.toFixed(2)}
									</p>
									<p class="subtitle {isMobile ? 'is-7' : 'is-6'} has-text-grey-dark">Total Income</p>
								</div>
							</div>
							<div class="column {isMobile ? 'is-6' : ''}">
								<div class="box has-background-danger-light">
									<p class="title {isMobile ? 'is-6' : 'is-5'} has-text-danger">
										{getCurrencySymbol(userCurrency)}{isMobile ? metrics.totalExpenses.toFixed(0) : metrics.totalExpenses.toFixed(2)}
									</p>
									<p class="subtitle {isMobile ? 'is-7' : 'is-6'} has-text-grey-dark">Total Expenses</p>
								</div>
							</div>
							<div class="column {isMobile ? 'is-6' : ''}">
								<div class="box has-background-info-light">
									<p class="title {isMobile ? 'is-6' : 'is-5'} {metrics.netSavings >= 0 ? 'has-text-success' : 'has-text-danger'}">
										{getCurrencySymbol(userCurrency)}{Math.abs(isMobile ? metrics.netSavings.toFixed(0) : metrics.netSavings.toFixed(2))}
									</p>
									<p class="subtitle {isMobile ? 'is-7' : 'is-6'} has-text-grey-dark">
										{metrics.netSavings >= 0 ? 'Net Savings' : 'Net Loss'}
									</p>
								</div>
							</div>
							<div class="column {isMobile ? 'is-6' : ''}">
								<div class="box has-background-warning-light">
									<p class="title {isMobile ? 'is-6' : 'is-5'} has-text-warning">{metrics.savingsRate}%</p>
									<p class="subtitle {isMobile ? 'is-7' : 'is-6'} has-text-grey-dark">Savings Rate</p>
								</div>
							</div>
						</div>
					{/if}

					<!-- Charts Grid -->
					{#if isLoading}
						<div class="has-text-centered py-6">
							<p class="has-text-grey-light">Loading analytics data...</p>
						</div>
					{:else if transactions.length === 0}
						<div class="has-text-centered py-6">
							<div class="content has-text-centered">
								<p class="has-text-grey-light mb-3">No transaction data available for analytics.</p>
								<a href="/Add-data" class="button is-warning {isMobile ? 'is-small' : ''}">
									Add Your First Transaction
								</a>
							</div>
						</div>
					{:else}
						<div class="charts-grid">
							<!-- Row 1: Monthly Trend and Category Breakdown -->
							<div class="columns {isMobile ? 'is-multiline' : ''}">
								<div class="column {isMobile ? 'is-12' : 'is-7'}">
									<div class="box has-background-black chart-container {isMobile ? 'mobile-chart' : 'desktop-chart'}">
										<canvas id="monthlyTrendChart"></canvas>
									</div>
								</div>
								<div class="column {isMobile ? 'is-12' : 'is-5'}">
									<div class="box has-background-black chart-container {isMobile ? 'mobile-chart' : 'desktop-chart'}">
										<canvas id="categoryChart"></canvas>
									</div>
								</div>
							</div>

							<!-- Row 2: Weekly Pattern and Income vs Expenses -->
							<div class="columns {isMobile ? 'is-multiline' : ''}">
								<div class="column {isMobile ? 'is-12' : 'is-6'}">
									<div class="box has-background-black chart-container {isMobile ? 'mobile-chart' : 'desktop-chart'}">
										<canvas id="weeklyPatternChart"></canvas>
									</div>
								</div>
								<div class="column {isMobile ? 'is-12' : 'is-6'}">
									<div class="box has-background-black chart-container {isMobile ? 'mobile-chart' : 'desktop-chart'}">
										<canvas id="incomeExpenseChart"></canvas>
									</div>
								</div>
							</div>
						</div>

						<!-- Insights Section -->
						{#if metrics && categoryData}
							<div class="box has-background-black mt-5">
								<h3 class="title {isMobile ? 'is-5' : 'is-4'} has-text-white mb-4">Spending Insights</h3>
								
								<div class="content has-text-grey-light">
									{#if categoryData.labels.length > 0}
										<p class="{isMobile ? 'is-size-7' : ''}">
											Your top spending category is <strong class="has-text-warning">{categoryData.labels[0]}</strong> 
											with {getCurrencySymbol(userCurrency)}{isMobile ? categoryData.data[0].toFixed(0) : categoryData.data[0].toFixed(2)} spent.
										</p>
										
										{#if metrics.savingsRate > 0}
											<p class="{isMobile ? 'is-size-7' : ''}">
												You're saving <strong class="has-text-success">{metrics.savingsRate}%</strong> of your income. Great job! 🎉
											</p>
										{:else}
											<p class="{isMobile ? 'is-size-7' : ''}">
												You're spending more than you earn. Consider reviewing your expenses. 💡
											</p>
										{/if}

										<p class="{isMobile ? 'is-size-7' : ''}">
											Total transactions analyzed: <strong>{transactions.length}</strong>
										</p>
									{/if}
								</div>
							</div>
						{/if}
					{/if}
				</div>

				<!-- Modern Mobile Bottom Navigation -->
				{#if isMobile}
					<div class="modern-bottom-nav">
						<nav class="bottom-nav-container">
							<div class="bottom-nav-item">
								<a href="/Dashboard" class="bottom-nav-link">
									<div class="bottom-nav-icon">
										<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
											<path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" 
												stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
											<path d="M9 22V12H15V22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									</div>
									<span class="bottom-nav-label">Dashboard</span>
								</a>
							</div>

							<div class="bottom-nav-item">
								<a href="/Transactions" class="bottom-nav-link">
									<div class="bottom-nav-icon">
										<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
											<path d="M12 1V23" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
											<path d="M17 5H9.5C8.57174 5 7.6815 5.36875 7.02513 6.02513C6.36875 6.6815 6 7.57174 6 8.5C6 9.42826 6.36875 10.3185 7.02513 10.9749C7.6815 11.6313 8.57174 12 9.5 12H14.5C15.4283 12 16.3185 12.3687 16.9749 13.0251C17.6313 13.6815 18 14.5717 18 15.5C18 16.4283 17.6313 17.3185 16.9749 17.9749C16.3185 18.6313 15.4283 19 14.5 19H6" 
												stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									</div>
									<span class="bottom-nav-label">Transactions</span>
								</a>
							</div>

							<div class="bottom-nav-item">
								<a href="/Budgets" class="bottom-nav-link">
									<div class="bottom-nav-icon">
										<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
											<path d="M12 2C13.3132 2 14.6136 2.25866 15.8268 2.7612C17.0401 3.26375 18.1425 4.00035 19.0711 4.92893C19.9997 5.85752 20.7362 6.95991 21.2388 8.17317C21.7413 9.38642 22 10.6868 22 12C22 14.6522 20.9464 17.1957 19.0711 19.0711C17.1957 20.9464 14.6522 22 12 22C9.34784 22 6.8043 20.9464 4.92893 19.0711C3.05357 17.1957 2 14.6522 2 12C2 9.34784 3.05357 6.8043 4.92893 4.92893C6.8043 3.05357 9.34784 2 12 2Z" 
												stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
											<path d="M12 6V12L16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									</div>
									<span class="bottom-nav-label">Budgets</span>
								</a>
							</div>

							<div class="bottom-nav-item active">
								<a href="/Analytics" class="bottom-nav-link">
									<div class="bottom-nav-icon">
										<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
											<path d="M18 20V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
											<path d="M12 20V4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
											<path d="M6 20V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									</div>
									<span class="bottom-nav-label">Analytics</span>
								</a>
							</div>

							<div class="bottom-nav-item">
								<a href="/Profile" class="bottom-nav-link">
									<div class="bottom-nav-icon">
										<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
											<path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" 
												stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
											<path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" 
												stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									</div>
									<span class="bottom-nav-label">Profile</span>
								</a>
							</div>
						</nav>
					</div>
				{/if}
			</div>
		</div>
	</div>
</section>

<style>
	:global(.section) {
		background: linear-gradient(135deg, #1a1a1a 0%, #000000 100%);
		min-height: 100vh;
		padding: 1rem;
		padding-bottom: 5rem; /* Space for bottom nav */
	}

	:global(.box.has-background-grey-darker) {
		background-color: #1a1a1a !important;
		border: 1px solid #333;
		border-radius: 8px;
	}

	:global(.box.has-background-black) {
		background-color: #000000 !important;
		border: 1px solid #333;
	}

	.chart-container {
		position: relative;
		padding: 1.5rem;
	}

	.chart-container.desktop-chart {
		height: 300px;
	}

	.chart-container.mobile-chart {
		height: 250px;
		padding: 1rem;
	}

	:global(.box.has-background-success-light) {
		background-color: rgba(81, 207, 102, 0.1) !important;
		border: 1px solid #51cf66;
	}

	:global(.box.has-background-danger-light) {
		background-color: rgba(255, 107, 107, 0.1) !important;
		border: 1px solid #ff6b6b;
	}

	:global(.box.has-background-info-light) {
		background-color: rgba(32, 156, 238, 0.1) !important;
		border: 1px solid #209cee;
	}

	:global(.box.has-background-warning-light) {
		background-color: rgba(255, 62, 0, 0.1) !important;
		border: 1px solid #ff3e00;
	}

	:global(.button.is-warning) {
		background-color: #ff3e00;
		border-color: #ff3e00;
		color: white;
	}

	/* Mobile Header */
	.mobile-header {
		padding: 1rem;
	}

	/* Modern Bottom Navigation Styles */
	.modern-bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: #1a1a1a;
		border-top: 1px solid #333;
		backdrop-filter: blur(20px);
		z-index: 1000;
		padding: 0.5rem 0;
	}

	.bottom-nav-container {
		display: flex;
		justify-content: space-around;
		align-items: center;
		max-width: 100%;
		margin: 0 auto;
	}

	.bottom-nav-item {
		flex: 1;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.bottom-nav-link {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		padding: 0.5rem 0.25rem;
		width: 100%;
		transition: all 0.3s ease;
		position: relative;
	}

	.bottom-nav-icon {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.25rem;
		transition: all 0.3s ease;
		color: #888;
	}

	.bottom-nav-label {
		font-size: 0.7rem;
		font-weight: 500;
		color: #888;
		transition: all 0.3s ease;
		line-height: 1;
	}

	/* Active state */
	.bottom-nav-item.active .bottom-nav-icon {
		color: #ff3e00;
		transform: translateY(-2px);
	}

	.bottom-nav-item.active .bottom-nav-label {
		color: #ff3e00;
		font-weight: 600;
	}

	/* Hover effects */
	.bottom-nav-link:hover .bottom-nav-icon {
		color: #ff3e00;
		transform: translateY(-1px);
	}

	.bottom-nav-link:hover .bottom-nav-label {
		color: #ff3e00;
	}

	/* Active indicator */
	.bottom-nav-item.active::before {
		content: '';
		position: absolute;
		top: -1px;
		left: 50%;
		transform: translateX(-50%);
		width: 4px;
		height: 4px;
		background: #ff3e00;
		border-radius: 50%;
	}

	/* Mobile optimizations */
	@media (max-width: 768px) {
		:global(.title.is-2) {
			font-size: 1.5rem;
		}

		:global(.title.is-4) {
			font-size: 1.25rem;
		}

		:global(.title.is-5) {
			font-size: 1.125rem;
		}

		:global(.title.is-6) {
			font-size: 1rem;
		}

		.bottom-nav-label {
			font-size: 0.65rem;
		}

		.bottom-nav-icon {
			width: 22px;
			height: 22px;
		}

		.columns.is-mobile .column {
			padding: 0.5rem;
		}

		.charts-grid .columns {
			margin-bottom: 0.5rem;
		}
	}

	/* Very small mobile devices */
	@media (max-width: 360px) {
		:global(.section) {
			padding: 0.5rem;
			padding-bottom: 4.5rem;
		}

		.bottom-nav-label {
			font-size: 0.6rem;
		}

		.bottom-nav-icon {
			width: 20px;
			height: 20px;
		}

		.bottom-nav-link {
			padding: 0.4rem 0.2rem;
		}

		.chart-container.mobile-chart {
			height: 200px;
			padding: 0.75rem;
		}

		.columns.is-mobile .column {
			padding: 0.25rem;
		}
	}

	/* Tablet optimization */
	@media (min-width: 769px) and (max-width: 1023px) {
		:global(.container) {
			max-width: 100%;
			padding: 0 1rem;
		}

		:global(.column.is-9) {
			width: 75%;
		}

		:global(.column.is-3) {
			width: 25%;
		}

		.chart-container.desktop-chart {
			height: 280px;
		}
	}

	/* Global styles for consistency */
	:global(.menu-label) {
		color: white !important;
	}

	:global(.menu-list a) {
		color: #888 !important;
		border-radius: 4px;
	}

	:global(.menu-list a:hover) {
		background-color: #333;
		color: #ff3e00 !important;
	}

	:global(.menu-list a.is-active) {
		background-color: #ff3e00 !important;
		color: white !important;
	}

	:global(.notification.is-danger) {
		background-color: rgba(255, 107, 107, 0.1) !important;
		border: 1px solid #ff6b6b;
		color: #ff6b6b !important;
	}

	:global(.has-text-warning) {
		color: #ff3e00 !important;
	}

	:global(.has-text-success) {
		color: #51cf66 !important;
	}

	:global(.has-text-danger) {
		color: #ff6b6b !important;
	}
</style>