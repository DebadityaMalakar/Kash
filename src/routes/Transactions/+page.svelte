<script lang="ts">
	import { onMount } from 'svelte';
	import { auth, db } from '$lib/firebase/firebase';
	import { onAuthStateChanged, type User } from '@firebase/auth';
	import { 
		collection, 
		query, 
		orderBy, 
		onSnapshot, 
		where,
		type DocumentData,
		Timestamp 
	} from 'firebase/firestore';
	import { doc, getDoc } from 'firebase/firestore';
	import Sidebar from '../../sections/Sidebar.svelte';

	// User state
	let user: User | null = null;
	let userCurrency = 'INR';

	// Transactions state
	let transactions: DocumentData[] = [];
	let filteredTransactions: DocumentData[] = [];
	let isLoading = true;
	let errorMessage = '';

	// Filter state
	let searchTerm = '';
	let selectedCategory = 'all';
	let selectedType = 'all';
	let dateRange = 'all';

	// Available categories (same as in Add Data)
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

	// Date ranges
	const dateRanges = [
		{ value: 'all', label: 'All Time' },
		{ value: 'today', label: 'Today' },
		{ value: 'week', label: 'This Week' },
		{ value: 'month', label: 'This Month' },
		{ value: 'year', label: 'This Year' }
	];

	// Currency symbols
	const currencySymbols: { [key: string]: string } = {
		'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥',
		'CAD': 'C$', 'AUD': 'A$', 'INR': '₹', 'CNY': '¥',
		'CHF': 'CHF', 'BTC': '₿', 'ETH': 'Ξ'
	};

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

	// Load transactions from Firestore
	function loadTransactions() {
		if (!user) return;

		isLoading = true;
		const transactionsRef = collection(db, 'users', user.uid, 'transactions');
		const q = query(transactionsRef, orderBy('date', 'desc'));

		const unsubscribe = onSnapshot(q, 
			(snapshot) => {
				transactions = snapshot.docs.map(doc => ({ 
					id: doc.id, 
					...doc.data() 
				}));
				applyFilters();
				isLoading = false;
			},
			(error) => {
				console.error('Error loading transactions:', error);
				errorMessage = 'Failed to load transactions. Please try again.';
				isLoading = false;
			}
		);

		return unsubscribe;
	}

	// Apply filters to transactions
	function applyFilters() {
		let filtered = [...transactions];

		// Search filter
		if (searchTerm) {
			const term = searchTerm.toLowerCase();
			filtered = filtered.filter(transaction =>
				transaction.description.toLowerCase().includes(term) ||
				transaction.category.toLowerCase().includes(term)
			);
		}

		// Category filter
		if (selectedCategory !== 'all') {
			filtered = filtered.filter(transaction =>
				transaction.category === selectedCategory
			);
		}

		// Type filter
		if (selectedType !== 'all') {
			filtered = filtered.filter(transaction =>
				transaction.type === selectedType
			);
		}

		// Date range filter
		if (dateRange !== 'all') {
			const now = new Date();
			let startDate: Date;

			switch (dateRange) {
				case 'today':
					startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
					break;
				case 'week':
					startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
					break;
				case 'month':
					startDate = new Date(now.getFullYear(), now.getMonth(), 1);
					break;
				case 'year':
					startDate = new Date(now.getFullYear(), 0, 1);
					break;
				default:
					startDate = new Date(0); // Beginning of time
			}

			filtered = filtered.filter(transaction => {
				const transactionDate = transaction.date.toDate();
				return transactionDate >= startDate;
			});
		}

		filteredTransactions = filtered;
	}

	// Get currency symbol
	function getCurrencySymbol(currencyCode: string): string {
		return currencySymbols[currencyCode] || currencyCode;
	}

	// Format amount with proper sign and color
	function formatAmount(amount: number, type: string): { display: string, class: string } {
		const isExpense = type === 'expense';
		const displaySign = isExpense ? '-' : '+';
		const formattedAmount = Math.abs(amount).toLocaleString('en-US', { 
			minimumFractionDigits: 2, 
			maximumFractionDigits: 2 
		});
		const cssClass = isExpense ? 'has-text-danger' : 'has-text-success';
		
		return { 
			display: `${displaySign}${getCurrencySymbol(userCurrency)}${formattedAmount}`,
			class: cssClass
		};
	}

	// Format date for display
	function formatDate(timestamp: Timestamp): string {
		if (!timestamp) return 'N/A';
		return timestamp.toDate().toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Calculate totals
	function calculateTotals() {
		const income = filteredTransactions
			.filter(t => t.type === 'income')
			.reduce((sum, t) => sum + Math.abs(t.amount), 0);
		
		const expenses = filteredTransactions
			.filter(t => t.type === 'expense')
			.reduce((sum, t) => sum + Math.abs(t.amount), 0);
		
		const net = income - expenses;

		return { income, expenses, net };
	}

	// Clear all filters
	function clearFilters() {
		searchTerm = '';
		selectedCategory = 'all';
		selectedType = 'all';
		dateRange = 'all';
		applyFilters();
	}

	$: {
		// Reactively apply filters when any filter changes
		if (user) {
			applyFilters();
		}
	}

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
			user = currentUser;
			if (user) {
				loadUserCurrency();
				loadTransactions();
			} else {
				transactions = [];
				filteredTransactions = [];
				isLoading = false;
			}
		});

		return () => unsubscribe();
	});
</script>

<svelte:head>
	<title>Transactions - Kash</title>
</svelte:head>

<section class="section">
	<div class="container">
		<div class="columns">
			<!-- Sidebar -->
			<Sidebar />

			<!-- Main Content -->
			<div class="column is-9">
				<div class="box has-background-grey-darker">
					<div class="level">
						<div class="level-left">
							<h1 class="title is-2 has-text-white">Transactions</h1>
						</div>
						<div class="level-right">
							<a href="/Add-Data" class="button is-warning">
								<span class="icon">➕</span>
								<span>Add Transaction</span>
							</a>
						</div>
					</div>

					<!-- Error Message -->
					{#if errorMessage}
						<div class="notification is-danger">
							<button class="delete" on:click={() => errorMessage = ''}></button>
							{errorMessage}
						</div>
					{/if}

					<!-- Filters Section -->
					<div class="box has-background-black mb-5">
						<h3 class="title is-5 has-text-white mb-4">Filters</h3>
						
						<div class="columns is-multiline">
							<!-- Search -->
							<div class="column is-3">
								<div class="field">
									<label class="label has-text-white">Search</label>
									<div class="control">
										<input
											class="input"
											type="text"
											placeholder="Search transactions..."
											bind:value={searchTerm}
										/>
									</div>
								</div>
							</div>

							<!-- Category -->
							<div class="column is-3">
								<div class="field">
									<label class="label has-text-white">Category</label>
									<div class="control">
										<div class="select is-fullwidth">
											<select bind:value={selectedCategory}>
												<option value="all">All Categories</option>
												{#each categories as category}
													<option value={category}>{category}</option>
												{/each}
											</select>
										</div>
									</div>
								</div>
							</div>

							<!-- Type -->
							<div class="column is-2">
								<div class="field">
									<label class="label has-text-white">Type</label>
									<div class="control">
										<div class="select is-fullwidth">
											<select bind:value={selectedType}>
												<option value="all">All Types</option>
												<option value="income">Income</option>
												<option value="expense">Expense</option>
											</select>
										</div>
									</div>
								</div>
							</div>

							<!-- Date Range -->
							<div class="column is-2">
								<div class="field">
									<label class="label has-text-white">Date Range</label>
									<div class="control">
										<div class="select is-fullwidth">
											<select bind:value={dateRange}>
												{#each dateRanges as range}
													<option value={range.value}>{range.label}</option>
												{/each}
											</select>
										</div>
									</div>
								</div>
							</div>

							<!-- Clear Filters -->
							<div class="column is-2">
								<label class="label has-text-white">&nbsp;</label>
								<div class="control">
									<button class="button is-light is-fullwidth" on:click={clearFilters}>
										Clear Filters
									</button>
								</div>
							</div>
						</div>
					</div>

					<!-- Summary Cards -->
					{#if !isLoading && filteredTransactions.length > 0}
						{@const totals = calculateTotals()}
						<div class="columns is-mobile has-text-centered mb-5">
							<div class="column">
								<div class="box has-background-success-light">
									<p class="title is-5 has-text-success">
										{getCurrencySymbol(userCurrency)}{totals.income.toFixed(2)}
									</p>
									<p class="subtitle is-6 has-text-grey-dark">Total Income</p>
								</div>
							</div>
							<div class="column">
								<div class="box has-background-danger-light">
									<p class="title is-5 has-text-danger">
										{getCurrencySymbol(userCurrency)}{totals.expenses.toFixed(2)}
									</p>
									<p class="subtitle is-6 has-text-grey-dark">Total Expenses</p>
								</div>
							</div>
							<div class="column">
								<div class="box has-background-info-light">
									<p class="title is-5 {totals.net >= 0 ? 'has-text-success' : 'has-text-danger'}">
										{getCurrencySymbol(userCurrency)}{Math.abs(totals.net).toFixed(2)}
									</p>
									<p class="subtitle is-6 has-text-grey-dark">
										{totals.net >= 0 ? 'Net Savings' : 'Net Loss'}
									</p>
								</div>
							</div>
						</div>
					{/if}

					<!-- Transactions List -->
					<div class="box has-background-black">
						<div class="level is-mobile">
							<div class="level-left">
								<h3 class="title is-5 has-text-white">
									{filteredTransactions.length} Transaction{filteredTransactions.length !== 1 ? 's' : ''}
								</h3>
							</div>
							<div class="level-right">
								{#if filteredTransactions.length !== transactions.length}
									<p class="has-text-grey-light is-size-7">
										Filtered from {transactions.length} total
									</p>
								{/if}
							</div>
						</div>

						{#if isLoading}
							<div class="has-text-centered py-6">
								<p class="has-text-grey-light">Loading transactions...</p>
							</div>
						{:else if filteredTransactions.length === 0}
							<div class="has-text-centered py-6">
								{#if transactions.length === 0}
									<div class="content has-text-centered">
										<p class="has-text-grey-light mb-3">No transactions yet.</p>
										<a href="/Add-data" class="button is-warning">
											Add Your First Transaction
										</a>
									</div>
								{:else}
									<p class="has-text-grey-light">No transactions match your filters.</p>
									<button class="button is-text is-small has-text-warning" on:click={clearFilters}>
										Clear filters to see all transactions
									</button>
								{/if}
							</div>
						{:else}
							<div class="table-container">
								<table class="table is-fullwidth is-hoverable">
									<thead>
										<tr>
											<th class="has-text-grey-light">Date</th>
											<th class="has-text-grey-light">Description</th>
											<th class="has-text-grey-light">Category</th>
											<th class="has-text-grey-light">Type</th>
											<th class="has-text-grey-light has-text-right">Amount</th>
										</tr>
									</thead>
									<tbody>
										{#each filteredTransactions as transaction (transaction.id)}
											{@const formattedAmount = formatAmount(transaction.amount, transaction.type)}
											<tr>
												<td class="has-text-grey-light">
													{formatDate(transaction.date)}
												</td>
												<td class="has-text-white">
													{transaction.description}
												</td>
												<td class="has-text-grey-light">
													<span class="tag is-light">{transaction.category}</span>
												</td>
												<td class="has-text-grey-light">
													<span class="tag {transaction.type === 'income' ? 'is-success' : 'is-danger'} is-light">
														{transaction.type}
													</span>
												</td>
												<td class="has-text-right {formattedAmount.class}">
													{formattedAmount.display}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
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

	:global(.input),
	:global(.select select) {
		background-color: #333 !important;
		border-color: #444 !important;
		color: white !important;
	}

	:global(.input:focus),
	:global(.select select:focus) {
		border-color: #ff3e00 !important;
		box-shadow: 0 0 0 0.125em rgba(255, 62, 0, 0.25) !important;
	}

	:global(.button.is-warning) {
		background-color: #ff3e00;
		border-color: #ff3e00;
		color: white;
	}

	:global(.table) {
		background-color: #000000 !important;
	}

	:global(.table th) {
		color: #888 !important;
		border-color: #333 !important;
	}

	:global(.table td) {
		border-color: #333 !important;
	}

	:global(.table tbody tr:hover) {
		background-color: #333 !important;
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

	:global(.tag.is-light) {
		background-color: #333 !important;
		color: #ccc !important;
	}

	:global(.tag.is-success) {
		background-color: #51cf66 !important;
		color: white !important;
	}

	:global(.tag.is-danger) {
		background-color: #ff6b6b !important;
		color: white !important;
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
</style>