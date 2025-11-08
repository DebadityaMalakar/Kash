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
	let encryptionKey: CryptoKey | null = null;
	let isEncryptionInitialized = false;

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

	// Mobile state
	let isMobile = false;

	// Key management state
	let showKeyExportModal = false;
	let exportedKeyString = '';
	let importKeyString = '';
	let isExportingKey = false;
	let isImportingKey = false;

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

	// Encryption functions
	async function generateEncryptionKey(): Promise<CryptoKey> {
		return await crypto.subtle.generateKey(
			{
				name: 'AES-GCM',
				length: 256,
			},
			true,
			['encrypt', 'decrypt']
		);
	}

	async function exportKey(key: CryptoKey): Promise<string> {
		const exported = await crypto.subtle.exportKey('raw', key);
		const exportedKeyBuffer = new Uint8Array(exported);
		return btoa(String.fromCharCode(...exportedKeyBuffer));
	}

	async function importKey(keyString: string): Promise<CryptoKey> {
		const keyBuffer = Uint8Array.from(atob(keyString), c => c.charCodeAt(0));
		return await crypto.subtle.importKey(
			'raw',
			keyBuffer,
			{
				name: 'AES-GCM',
				length: 256,
			},
			true,
			['encrypt', 'decrypt']
		);
	}

	// Get master key from environment or generate derived key
	async function getMasterKey(): Promise<CryptoKey> {
		const envKey = import.meta.env.VITE_PUBLIC_ENCRYPT_KEY;
		
		if (envKey) {
			const encoder = new TextEncoder();
			const keyMaterial = encoder.encode(envKey + (user?.uid || ''));
			
			const baseKey = await crypto.subtle.importKey(
				'raw',
				keyMaterial,
				'PBKDF2',
				false,
				['deriveKey']
			);
			
			return await crypto.subtle.deriveKey(
				{
					name: 'PBKDF2',
					salt: encoder.encode('kash-encryption-salt'),
					iterations: 100000,
					hash: 'SHA-256'
				},
				baseKey,
				{
					name: 'AES-GCM',
					length: 256
				},
				true,
				['encrypt', 'decrypt']
			);
		} else {
			return await generateEncryptionKey();
		}
	}

	async function decryptData(encryptedData: string, iv: string): Promise<string> {
		if (!encryptionKey) {
			throw new Error('Encryption key not available');
		}

		const encryptedBuffer = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
		const ivBuffer = Uint8Array.from(atob(iv), c => c.charCodeAt(0));

		const decryptedBuffer = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: ivBuffer,
			},
			encryptionKey,
			encryptedBuffer
		);

		const decoder = new TextDecoder();
		return decoder.decode(decryptedBuffer);
	}

	// Initialize or load encryption key
	async function initializeEncryption() {
		if (!user) return;

		try {
			const storageKey = `encryptionKey_${user.uid}`;
			const storedKey = localStorage.getItem(storageKey);

			if (storedKey) {
				encryptionKey = await importKey(storedKey);
			} else {
				encryptionKey = await getMasterKey();
				const exportedKey = await exportKey(encryptionKey);
				localStorage.setItem(storageKey, exportedKey);
			}
			
			isEncryptionInitialized = true;
		} catch (error) {
			console.error('Error initializing encryption:', error);
			isEncryptionInitialized = false;
			throw new Error('Failed to initialize encryption');
		}
	}

	// Key export functionality
	async function exportEncryptionKey() {
		if (!encryptionKey || !user) return;
		
		isExportingKey = true;
		try {
			exportedKeyString = await exportKey(encryptionKey);
			showKeyExportModal = true;
		} catch (error) {
			console.error('Error exporting key:', error);
			errorMessage = 'Failed to export encryption key';
		} finally {
			isExportingKey = false;
		}
	}

	// Key import functionality
	async function importEncryptionKey() {
		if (!user || !importKeyString.trim()) return;
		
		isImportingKey = true;
		try {
			const testKey = await importKey(importKeyString.trim());
			
			const storageKey = `encryptionKey_${user.uid}`;
			localStorage.setItem(storageKey, importKeyString.trim());
			
			encryptionKey = testKey;
			isEncryptionInitialized = true;
			
			successMessage = 'Encryption key imported successfully!';
			showKeyExportModal = false;
			importKeyString = '';
			
			// Reload transactions with new key
			loadTransactions();
		} catch (error) {
			console.error('Error importing key:', error);
			errorMessage = 'Invalid encryption key format';
		} finally {
			isImportingKey = false;
		}
	}

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

	// Decrypt transaction data
	async function decryptTransaction(transaction: any): Promise<any> {
		try {
			let decryptedAmount = transaction.amountPlain;
			let decryptedDate = transaction.datePlain;

			// Try to decrypt amount if encrypted fields exist
			if (transaction.amount && transaction.amountIv) {
				try {
					decryptedAmount = parseFloat(await decryptData(transaction.amount, transaction.amountIv));
				} catch (error) {
					console.warn('Failed to decrypt amount, using plain value:', error);
				}
			}

			// Try to decrypt date if encrypted fields exist
			if (transaction.date && transaction.dateIv) {
				try {
					const decryptedDateStr = await decryptData(transaction.date, transaction.dateIv);
					decryptedDate = Timestamp.fromDate(new Date(decryptedDateStr));
				} catch (error) {
					console.warn('Failed to decrypt date, using plain value:', error);
				}
			}

			return {
				...transaction,
				amount: decryptedAmount,
				date: decryptedDate
			};
		} catch (error) {
			console.error('Error decrypting transaction:', error);
			// Return original transaction if decryption fails
			return transaction;
		}
	}

	// Load transactions from Firestore with decryption
	async function loadTransactions() {
		if (!user) return;

		isLoading = true;
		const transactionsRef = collection(db, 'users', user.uid, 'transactions');
		const q = query(transactionsRef, orderBy('datePlain', 'desc'));

		const unsubscribe = onSnapshot(q, 
			async (snapshot) => {
				try {
					const rawTransactions = snapshot.docs.map(doc => ({ 
						id: doc.id, 
						...doc.data() 
					}));

					// Decrypt all transactions
					const decryptedTransactions = [];
					for (const transaction of rawTransactions) {
						const decryptedTransaction = await decryptTransaction(transaction);
						decryptedTransactions.push(decryptedTransaction);
					}

					transactions = decryptedTransactions;
					applyFilters();
				} catch (error) {
					console.error('Error processing transactions:', error);
					errorMessage = 'Failed to load transactions. Please check your encryption key.';
				} finally {
					isLoading = false;
				}
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
		// Check initial screen size
		checkScreenSize();
		window.addEventListener('resize', checkScreenSize);

		const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
			user = currentUser;
			if (user) {
				try {
					await loadUserCurrency();
					await initializeEncryption();
					loadTransactions();
				} catch (error) {
					console.error('Error initializing user session:', error);
					errorMessage = 'Failed to initialize. Please try refreshing.';
					isLoading = false;
				}
			} else {
				transactions = [];
				filteredTransactions = [];
				isLoading = false;
				encryptionKey = null;
				isEncryptionInitialized = false;
			}
		});

		return () => {
			unsubscribe();
			window.removeEventListener('resize', checkScreenSize);
		};
	});
</script>

<svelte:head>
	<title>Transactions - Kash</title>
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
								<h1 class="title is-4 has-text-white mb-0">Transactions</h1>
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
					{/if}

					<!-- Encryption Status -->
					{#if user}
						<div class="notification {isEncryptionInitialized ? 'is-success' : 'is-warning'} is-light mb-4">
							<div class="content has-text-centered">
								<p class="has-text-weight-semibold">
									{isEncryptionInitialized ? '🔒' : '⚠️'} Data Encryption: 
									<span class="tag {isEncryptionInitialized ? 'is-success' : 'is-warning'} is-medium">
										{isEncryptionInitialized ? 'Active' : 'Initializing...'}
									</span>
								</p>
								<p class="is-size-7 has-text-grey">
									{isEncryptionInitialized 
										? 'Amount and date fields are decrypted for display'
										: 'Setting up decryption system...'}
								</p>
								<div class="buttons is-centered mt-2">
									<button class="button is-small is-info" on:click={exportEncryptionKey} disabled={isExportingKey}>
										{isExportingKey ? 'Exporting...' : '🔑 Export Key'}
									</button>
									<button class="button is-small is-warning" on:click={() => showKeyExportModal = true}>
										📥 Import Key
									</button>
								</div>
							</div>
						</div>
					{/if}

					<!-- Error Message -->
					{#if errorMessage}
						<div class="notification is-danger">
							<button class="delete" on:click={() => errorMessage = ''}></button>
							{errorMessage}
						</div>
					{/if}

					<!-- Filters Section -->
					<div class="box has-background-black mb-5">
						<h3 class="title {isMobile ? 'is-6' : 'is-5'} has-text-white mb-4">Filters</h3>
						
						<div class="columns is-multiline">
							<!-- Search -->
							<div class="column {isMobile ? 'is-12' : 'is-3'}">
								<div class="field">
									<label class="label has-text-white {isMobile ? 'is-size-7' : ''}">Search</label>
									<div class="control">
										<input
											class="input {isMobile ? 'is-small' : ''}"
											type="text"
											placeholder="Search transactions..."
											bind:value={searchTerm}
										/>
									</div>
								</div>
							</div>

							<!-- Category -->
							<div class="column {isMobile ? 'is-6' : 'is-3'}">
								<div class="field">
									<label class="label has-text-white {isMobile ? 'is-size-7' : ''}">Category</label>
									<div class="control">
										<div class="select {isMobile ? 'is-small is-fullwidth' : 'is-fullwidth'}">
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
							<div class="column {isMobile ? 'is-6' : 'is-2'}">
								<div class="field">
									<label class="label has-text-white {isMobile ? 'is-size-7' : ''}">Type</label>
									<div class="control">
										<div class="select {isMobile ? 'is-small is-fullwidth' : 'is-fullwidth'}">
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
							<div class="column {isMobile ? 'is-6' : 'is-2'}">
								<div class="field">
									<label class="label has-text-white {isMobile ? 'is-size-7' : ''}">Date Range</label>
									<div class="control">
										<div class="select {isMobile ? 'is-small is-fullwidth' : 'is-fullwidth'}">
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
							<div class="column {isMobile ? 'is-6' : 'is-2'}">
								<label class="label has-text-white {isMobile ? 'is-size-7' : ''}">&nbsp;</label>
								<div class="control">
									<button class="button is-light {isMobile ? 'is-small is-fullwidth' : 'is-fullwidth'}" on:click={clearFilters}>
										Clear Filters
									</button>
								</div>
							</div>
						</div>
					</div>

					<!-- Summary Cards -->
					{#if !isLoading && filteredTransactions.length > 0 && isEncryptionInitialized}
						{@const totals = calculateTotals()}
						<div class="columns is-mobile has-text-centered mb-5">
							<div class="column">
								<div class="box has-background-success-light">
									<p class="title {isMobile ? 'is-6' : 'is-5'} has-text-success">
										{getCurrencySymbol(userCurrency)}{totals.income.toFixed(isMobile ? 0 : 2)}
									</p>
									<p class="subtitle {isMobile ? 'is-7' : 'is-6'} has-text-grey-dark">Total Income</p>
								</div>
							</div>
							<div class="column">
								<div class="box has-background-danger-light">
									<p class="title {isMobile ? 'is-6' : 'is-5'} has-text-danger">
										{getCurrencySymbol(userCurrency)}{totals.expenses.toFixed(isMobile ? 0 : 2)}
									</p>
									<p class="subtitle {isMobile ? 'is-7' : 'is-6'} has-text-grey-dark">Total Expenses</p>
								</div>
							</div>
							<div class="column">
								<div class="box has-background-info-light">
									<p class="title {isMobile ? 'is-6' : 'is-5'} {totals.net >= 0 ? 'has-text-success' : 'has-text-danger'}">
										{getCurrencySymbol(userCurrency)}{Math.abs(totals.net).toFixed(isMobile ? 0 : 2)}
									</p>
									<p class="subtitle {isMobile ? 'is-7' : 'is-6'} has-text-grey-dark">
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
								<h3 class="title {isMobile ? 'is-6' : 'is-5'} has-text-white">
									{filteredTransactions.length} Transaction{filteredTransactions.length !== 1 ? 's' : ''}
								</h3>
							</div>
							<div class="level-right">
								{#if filteredTransactions.length !== transactions.length}
									<p class="has-text-grey-light {isMobile ? 'is-size-7' : ''}">
										Filtered from {transactions.length} total
									</p>
								{/if}
							</div>
						</div>

						{#if isLoading}
							<div class="has-text-centered py-6">
								<p class="has-text-grey-light">Loading transactions...</p>
							</div>
						{:else if !isEncryptionInitialized}
							<div class="has-text-centered py-6">
								<div class="content has-text-centered">
									<p class="has-text-grey-light mb-3">Encryption not initialized.</p>
									<button class="button is-warning {isMobile ? 'is-small' : ''}" on:click={() => showKeyExportModal = true}>
										Import Encryption Key
									</button>
								</div>
							</div>
						{:else if filteredTransactions.length === 0}
							<div class="has-text-centered py-6">
								{#if transactions.length === 0}
									<div class="content has-text-centered">
										<p class="has-text-grey-light mb-3">No transactions yet.</p>
										<a href="/Add-data" class="button is-warning {isMobile ? 'is-small' : ''}">
											Add Your First Transaction
										</a>
									</div>
								{:else}
									<p class="has-text-grey-light">No transactions match your filters.</p>
									<button class="button is-text {isMobile ? 'is-small' : ''} has-text-warning" on:click={clearFilters}>
										Clear filters to see all transactions
									</button>
								{/if}
							</div>
						{:else}
							<div class="table-container">
								<table class="table is-fullwidth is-hoverable {isMobile ? 'is-size-7' : ''}">
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
													<span class="tag is-light {isMobile ? 'is-small' : ''}">{transaction.category}</span>
												</td>
												<td class="has-text-grey-light">
													<span class="tag {transaction.type === 'income' ? 'is-success' : 'is-danger'} is-light {isMobile ? 'is-small' : ''}">
														{isMobile ? (transaction.type === 'income' ? 'IN' : 'OUT') : transaction.type}
													</span>
												</td>
												<td class="has-text-right {formattedAmount.class}">
													{isMobile ? formattedAmount.display.replace(/[+-]/, transaction.type === 'income' ? '+' : '-').replace(/\d+\.\d{2}/, match => parseFloat(match).toFixed(0)) : formattedAmount.display}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
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

							<div class="bottom-nav-item active">
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

							<div class="bottom-nav-item">
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

<!-- Key Management Modal -->
{#if showKeyExportModal}
<div class="modal is-active">
	<div class="modal-background" on:click={() => showKeyExportModal = false}></div>
	<div class="modal-card">
		<header class="modal-card-head has-background-black">
			<p class="modal-card-title has-text-white">🔑 Encryption Key Management</p>
			<button class="delete" aria-label="close" on:click={() => showKeyExportModal = false}></button>
		</header>
		<section class="modal-card-body has-background-grey-darker">
			{#if exportedKeyString}
				<div class="content has-text-white">
					<h3 class="has-text-warning">Export Encryption Key</h3>
					<p class="has-text-grey-light is-size-7">
						Save this key securely! You'll need it to access your data on other devices.
						<strong>Keep it private and never share it.</strong>
					</p>
					<div class="field">
						<label class="label has-text-white">Your Encryption Key:</label>
						<div class="control">
							<textarea 
								class="textarea has-background-dark has-text-white" 
								readonly
								rows="4"
								value={exportedKeyString}
							></textarea>
						</div>
					</div>
					<div class="buttons">
						<button class="button is-warning" on:click={() => {
							navigator.clipboard.writeText(exportedKeyString);
							successMessage = 'Key copied to clipboard!';
							showKeyExportModal = false;
						}}>
							📋 Copy to Clipboard
						</button>
						<button class="button is-text has-text-grey-light" on:click={() => exportedKeyString = ''}>
							Close
						</button>
					</div>
				</div>
			{:else}
				<div class="content has-text-white">
					<h3 class="has-text-info">Import Encryption Key</h3>
					<p class="has-text-grey-light is-size-7">
						Paste your encryption key to access your data on this device.
					</p>
					<div class="field">
						<label class="label has-text-white">Encryption Key:</label>
						<div class="control">
							<textarea 
								class="textarea has-background-dark has-text-white" 
								placeholder="Paste your encryption key here..."
								bind:value={importKeyString}
								rows="4"
							></textarea>
						</div>
					</div>
					<div class="buttons">
						<button 
							class="button is-success {isImportingKey ? 'is-loading' : ''}" 
							on:click={importEncryptionKey}
							disabled={!importKeyString.trim() || isImportingKey}
						>
							📥 Import Key
						</button>
						<button class="button is-text has-text-grey-light" on:click={() => showKeyExportModal = false}>
							Cancel
						</button>
					</div>
				</div>
			{/if}
		</section>
	</div>
</div>
{/if}

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

	/* Modal Styles */
	.modal-card {
		border: 1px solid #333;
		border-radius: 6px;
	}
	
	.textarea.has-background-dark {
		background-color: #1a1a1a !important;
		border-color: #444;
		color: white !important;
		font-family: monospace;
		font-size: 0.875rem;
	}

	:global(.button.is-success) {
		background-color: #2ecc71;
		border-color: #2ecc71;
		color: white;
	}

	/* Mobile optimizations */
	@media (max-width: 768px) {
		:global(.table) {
			font-size: 0.75rem;
		}

		:global(.table th),
		:global(.table td) {
			padding: 0.5rem 0.25rem;
		}

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
	}
</style>