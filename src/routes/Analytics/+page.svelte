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
	// function createCharts() {
	// 	destroyCharts(); // Clean up existing charts

	// 	if (transactions.length === 0) return;

	// 	// Monthly Trend Chart (Bar Chart)
	// 	const monthlyData = aggregateMonthlySpending();
	// 	const monthlyTrendCtx = document.getElementById('monthlyTrendChart') as HTMLCanvasElement;
	// 	if (monthlyTrendCtx) {
	// 		monthlyTrendChart = new Chart(monthlyTrendCtx, {
	// 			type: 'bar',
	// 			data: {
	// 				labels: monthlyData.labels,
	// 				datasets: [{
	// 					label: `Monthly Spending (${getCurrencySymbol(userCurrency)})`,
	// 					data: monthlyData.data,
	// 					backgroundColor: 'rgba(255, 62, 0, 0.8)',
	// 					borderColor: 'rgba(255, 62, 0, 1)',
	// 					borderWidth: 1,
	// 					borderRadius: 4
	// 				}]
	// 			},
	// 			options: {
	// 				responsive: true,
	// 				plugins: {
	// 					legend: {
	// 						display: false
	// 					},
	// 					title: {
	// 						display: true,
	// 						text: 'Monthly Spending Trend',
	// 						color: '#fff',
	// 						font: {
	// 							size: 16
	// 						}
	// 					}
	// 				},
	// 				scales: {
	// 					y: {
	// 						beginAtZero: true,
	// 						ticks: {
	// 							color: '#888',
	// 							callback: function(value) {
	// 								return getCurrencySymbol(userCurrency) + value;
	// 							}
	// 						},
	// 						grid: {
	// 							color: '#333'
	// 						}
	// 					},
	// 					x: {
	// 						ticks: {
	// 							color: '#888'
	// 						},
	// 						grid: {
	// 							color: '#333'
	// 						}
	// 					}
	// 				}
	// 			}
	// 		});
	// 	}

	// 	// Category Breakdown (Doughnut Chart)
	// 	const categoryData = aggregateByCategory();
	// 	const categoryCtx = document.getElementById('categoryChart') as HTMLCanvasElement;
	// 	if (categoryCtx && categoryData.labels.length > 0) {
	// 		categoryChart = new Chart(categoryCtx, {
	// 			type: 'doughnut',
	// 			data: {
	// 				labels: categoryData.labels,
	// 				datasets: [{
	// 					data: categoryData.data,
	// 					backgroundColor: [
	// 						'#ff3e00', '#ff6a33', '#ff955c', '#ffbf85',
	// 						'#3298dc', '#51cf66', '#fcc419', '#be4bdb'
	// 					],
	// 					borderColor: '#1a1a1a',
	// 					borderWidth: 2
	// 				}]
	// 			},
	// 			options: {
	// 				responsive: true,
	// 				plugins: {
	// 					legend: {
	// 						position: 'right',
	// 						labels: {
	// 							color: '#fff',
	// 							font: {
	// 								size: 12
	// 							}
	// 						}
	// 					},
	// 					title: {
	// 						display: true,
	// 						text: 'Spending by Category',
	// 						color: '#fff',
	// 						font: {
	// 							size: 16
	// 						}
	// 					},
	// 					tooltip: {
	// 						callbacks: {
	// 							label: function(context) {
	// 								const label = context.label || '';
	// 								const value = context.raw as number;
	// 								const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
	// 								const percentage = Math.round((value / total) * 100);
	// 								return `${label}: ${getCurrencySymbol(userCurrency)}${value.toFixed(2)} (${percentage}%)`;
	// 							}
	// 						}
	// 					}
	// 				}
	// 			}
	// 		});
	// 	}

	// 	// Weekly Pattern (Bar Chart)
	// 	const weeklyData = aggregateWeeklyPattern();
	// 	const weeklyCtx = document.getElementById('weeklyPatternChart') as HTMLCanvasElement;
	// 	if (weeklyCtx) {
	// 		weeklyPatternChart = new Chart(weeklyCtx, {
	// 			type: 'bar',
	// 			data: {
	// 				labels: weeklyData.labels,
	// 				datasets: [{
	// 					label: `Average Spending (${getCurrencySymbol(userCurrency)})`,
	// 					data: weeklyData.data,
	// 					backgroundColor: 'rgba(32, 156, 238, 0.8)',
	// 					borderColor: 'rgba(32, 156, 238, 1)',
	// 					borderWidth: 1,
	// 					borderRadius: 4
	// 				}]
	// 			},
	// 			options: {
	// 				responsive: true,
	// 				plugins: {
	// 					legend: {
	// 						display: false
	// 					},
	// 					title: {
	// 						display: true,
	// 						text: 'Weekly Spending Pattern',
	// 						color: '#fff',
	// 						font: {
	// 							size: 16
	// 						}
	// 					}
	// 				},
	// 				scales: {
	// 					y: {
	// 						beginAtZero: true,
	// 						ticks: {
	// 							color: '#888',
	// 							callback: function(value) {
	// 								return getCurrencySymbol(userCurrency) + value;
	// 							}
	// 						},
	// 						grid: {
	// 							color: '#333'
	// 						}
	// 					},
	// 					x: {
	// 						ticks: {
	// 							color: '#888'
	// 						},
	// 						grid: {
	// 							color: '#333'
	// 						}
	// 					}
	// 				}
	// 			}
	// 		});
	// 	}

	// 	// Income vs Expenses (Line Chart)
	// 	const incomeExpenseData = aggregateIncomeVsExpenses();
	// 	const incomeExpenseCtx = document.getElementById('incomeExpenseChart') as HTMLCanvasElement;
	// 	if (incomeExpenseCtx) {
	// 		incomeExpenseChart = new Chart(incomeExpenseCtx, {
	// 			type: 'line',
	// 			data: {
	// 				labels: incomeExpenseData.labels,
	// 				datasets: [
	// 					{
	// 						label: 'Income',
	// 						data: incomeExpenseData.income,
	// 						borderColor: '#51cf66',
	// 						backgroundColor: 'rgba(81, 207, 102, 0.1)',
	// 						tension: 0.4,
	// 						fill: true
	// 					},
	// 					{
	// 						label: 'Expenses',
	// 						data: incomeExpenseData.expenses,
	// 						borderColor: '#ff6b6b',
	// 						backgroundColor: 'rgba(255, 107, 107, 0.1)',
	// 						tension: 0.4,
	// 						fill: true
	// 					}
	// 				]
	// 			},
	// 			options: {
	// 				responsive: true,
	// 				plugins: {
	// 					title: {
	// 						display: true,
	// 						text: 'Income vs Expenses',
	// 						color: '#fff',
	// 						font: {
	// 							size: 16
	// 						}
	// 					},
	// 					legend: {
	// 						labels: {
	// 							color: '#fff'
	// 						}
	// 					}
	// 				},
	// 				scales: {
	// 					y: {
	// 						beginAtZero: true,
	// 						ticks: {
	// 							color: '#888',
	// 							callback: function(value) {
	// 								return getCurrencySymbol(userCurrency) + value;
	// 							}
	// 						},
	// 						grid: {
	// 							color: '#333'
	// 						}
	// 					},
	// 					x: {
	// 						ticks: {
	// 							color: '#888'
	// 						},
	// 						grid: {
	// 							color: '#333'
	// 						}
	// 					}
	// 				}
	// 			}
	// 		});
	// 	}
	// }
    // Chart creation functions - FIXED VERSION
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
							size: 16
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
						position: 'right',
						labels: {
							color: '#fff',
							font: {
								size: 12
							}
						}
					},
					title: {
						display: true,
						text: 'Spending by Category',
						color: '#fff',
						font: {
							size: 16
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
							size: 16
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
							size: 16
						}
					},
					legend: {
						labels: {
							color: '#fff'
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
		};
	});
</script>

<svelte:head>
	<title>Analytics - Kash</title>
</svelte:head>

<section class="section">
	<div class="container">
		<div class="columns">
			<!-- Sidebar -->
			<Sidebar />

			<!-- Main Content -->
			<div class="column is-9">
				<div class="box has-background-grey-darker">
					<h1 class="title is-2 has-text-white mb-6">Analytics Dashboard</h1>

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
							<div class="column">
								<div class="box has-background-success-light">
									<p class="title is-5 has-text-success">
										{getCurrencySymbol(userCurrency)}{metrics.totalIncome.toFixed(2)}
									</p>
									<p class="subtitle is-6 has-text-grey-dark">Total Income</p>
								</div>
							</div>
							<div class="column">
								<div class="box has-background-danger-light">
									<p class="title is-5 has-text-danger">
										{getCurrencySymbol(userCurrency)}{metrics.totalExpenses.toFixed(2)}
									</p>
									<p class="subtitle is-6 has-text-grey-dark">Total Expenses</p>
								</div>
							</div>
							<div class="column">
								<div class="box has-background-info-light">
									<p class="title is-5 {metrics.netSavings >= 0 ? 'has-text-success' : 'has-text-danger'}">
										{getCurrencySymbol(userCurrency)}{Math.abs(metrics.netSavings).toFixed(2)}
									</p>
									<p class="subtitle is-6 has-text-grey-dark">
										{metrics.netSavings >= 0 ? 'Net Savings' : 'Net Loss'}
									</p>
								</div>
							</div>
							<div class="column">
								<div class="box has-background-warning-light">
									<p class="title is-5 has-text-warning">{metrics.savingsRate}%</p>
									<p class="subtitle is-6 has-text-grey-dark">Savings Rate</p>
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
								<a href="/Add-data" class="button is-warning">
									Add Your First Transaction
								</a>
							</div>
						</div>
					{:else}
						<div class="charts-grid">
							<!-- Row 1: Monthly Trend and Category Breakdown -->
							<div class="columns">
								<div class="column is-7">
									<div class="box has-background-black chart-container">
										<canvas id="monthlyTrendChart"></canvas>
									</div>
								</div>
								<div class="column is-5">
									<div class="box has-background-black chart-container">
										<canvas id="categoryChart"></canvas>
									</div>
								</div>
							</div>

							<!-- Row 2: Weekly Pattern and Income vs Expenses -->
							<div class="columns">
								<div class="column is-6">
									<div class="box has-background-black chart-container">
										<canvas id="weeklyPatternChart"></canvas>
									</div>
								</div>
								<div class="column is-6">
									<div class="box has-background-black chart-container">
										<canvas id="incomeExpenseChart"></canvas>
									</div>
								</div>
							</div>
						</div>

						<!-- Insights Section -->
						{#if metrics && categoryData}
							<div class="box has-background-black mt-5">
								<h3 class="title is-4 has-text-white mb-4">Spending Insights</h3>
								
								<div class="content has-text-grey-light">
									{#if categoryData.labels.length > 0}
										<p>
											Your top spending category is <strong class="has-text-warning">{categoryData.labels[0]}</strong> 
											with {getCurrencySymbol(userCurrency)}{categoryData.data[0].toFixed(2)} spent.
										</p>
										
										{#if metrics.savingsRate > 0}
											<p>
												You're saving <strong class="has-text-success">{metrics.savingsRate}%</strong> of your income. Great job! 🎉
											</p>
										{:else}
											<p>
												You're spending more than you earn. Consider reviewing your expenses. 💡
											</p>
										{/if}

										<p>
											Total transactions analyzed: <strong>{transactions.length}</strong>
										</p>
									{/if}
								</div>
							</div>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	:global(.section) {
		background: linear-gradient(135deg, #1a1a1a 0%, #000000 100%);
		min-height: 100vh;
	}

	:global(.box.has-background-grey-darker) {
		background-color: #1a1a1a !important;
		border: 1px solid #333;
	}

	:global(.box.has-background-black) {
		background-color: #000000 !important;
		border: 1px solid #333;
	}

	.chart-container {
		position: relative;
		height: 300px;
		padding: 1.5rem;
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
</style>