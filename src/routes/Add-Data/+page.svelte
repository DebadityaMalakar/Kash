<script lang="ts">
	import { onMount } from 'svelte';
	import { app, auth, db, storage } from '$lib/firebase/firebase';
	import { getAuth, onAuthStateChanged, type User } from '@firebase/auth';
	import { collection, addDoc, Timestamp, doc, getDoc } from 'firebase/firestore';
	import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
	import Sidebar from '../../sections/Sidebar.svelte';

	// User state
	let user: User | null = null;
	let userCurrency = 'INR'; // Default to Indian Rupees

	// Manual form state
	let description = '';
	let amount = '';
	let category = '';
	let transactionDate = '';
	let transactionType = 'expense';

	// File upload state
	let selectedFile: File | null = null;
	let isImporting = false;
	let isSubmitting = false;
	let successMessage = '';
	let errorMessage = '';

	// Categories
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

	// Currency symbols mapping
	const currencySymbols: { [key: string]: string } = {
		'USD': '$',
		'EUR': '€',
		'GBP': '£',
		'JPY': '¥',
		'CAD': 'C$',
		'AUD': 'A$',
		'INR': '₹',
		'CNY': '¥',
		'CHF': 'CHF',
		'BTC': '₿',
		'ETH': 'Ξ'
	};

	// Get currency symbol for display
	function getCurrencySymbol(currencyCode: string): string {
		return currencySymbols[currencyCode] || currencyCode;
	}

	// Load user currency preference
	async function loadUserCurrency() {
		if (!user) return;
		
		try {
			const userDoc = await getDoc(doc(db, 'users', user.uid));
			if (userDoc.exists()) {
				const userData = userDoc.data();
				userCurrency = userData.currency || 'INR'; // Default to INR if not set
			}
			// If user doesn't exist in Firestore yet, keep default INR
		} catch (error) {
			console.error('Error loading user currency:', error);
			// Keep default INR on error
		}
	}

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
			user = currentUser;
			if (user) {
				loadUserCurrency();
			}
		});
		return () => unsubscribe();
	});

	// Manual transaction submission
	async function handleManualSubmit(e: Event) {
		e.preventDefault();
		if (!user) {
			errorMessage = 'Please log in to add transactions';
			return;
		}

		isSubmitting = true;
		errorMessage = '';
		successMessage = '';

		try {
			const transactionData = {
				userId: user.uid,
				description: description.trim(),
				amount: parseFloat(amount),
				category: category || 'Other',
				type: transactionType,
				date: transactionDate ? Timestamp.fromDate(new Date(transactionDate)) : Timestamp.now(),
				currency: userCurrency, // Save currency with transaction
				createdAt: Timestamp.now(),
				updatedAt: Timestamp.now()
			};

			await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);

			successMessage = `Transaction added successfully! (Currency: ${getCurrencySymbol(userCurrency)})`;
			// Reset form
			description = '';
			amount = '';
			category = '';
			transactionDate = '';
			transactionType = 'expense';
		} catch (error) {
			console.error('Error adding transaction:', error);
			errorMessage = 'Failed to add transaction. Please try again.';
		} finally {
			isSubmitting = false;
		}
	}

	// File selection handler
	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			selectedFile = target.files[0];
			errorMessage = '';
		}
	}

	// CSV import handler
	async function handleCSVImport() {
		if (!selectedFile) {
			errorMessage = 'Please select a CSV file';
			return;
		}

		if (!user) {
			errorMessage = 'Please log in to import data';
			return;
		}

		isImporting = true;
		errorMessage = '';
		successMessage = '';

		try {
			const text = await selectedFile.text();
			const lines = text.split('\n').filter((line) => line.trim());
			const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

			// Validate CSV structure
			const requiredHeaders = ['description', 'amount', 'date'];
			const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

			if (missingHeaders.length > 0) {
				errorMessage = `Missing required columns: ${missingHeaders.join(', ')}`;
				return;
			}

			let importedCount = 0;
			let errorCount = 0;

			// Process each row (skip header)
			for (let i = 1; i < lines.length; i++) {
				try {
					const values = lines[i].split(',').map((v) => v.trim());
					const row: any = {};

					headers.forEach((header, index) => {
						row[header] = values[index] || '';
					});

					// Parse transaction data
					const transactionData = {
						userId: user.uid,
						description: row.description || 'Imported Transaction',
						amount: parseFloat(row.amount) || 0,
						category: row.category || 'Other',
						type: (parseFloat(row.amount) || 0) >= 0 ? 'income' : 'expense',
						date: row.date ? Timestamp.fromDate(new Date(row.date)) : Timestamp.now(),
						currency: userCurrency, // Save currency with imported transactions
						createdAt: Timestamp.now(),
						updatedAt: Timestamp.now()
					};

					// Validate required fields
					if (transactionData.description && !isNaN(transactionData.amount)) {
						await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);
						importedCount++;
					} else {
						errorCount++;
					}
				} catch (rowError) {
					console.error(`Error processing row ${i}:`, rowError);
					errorCount++;
				}
			}

			successMessage = `Successfully imported ${importedCount} transactions${errorCount > 0 ? `, ${errorCount} failed` : ''} (Currency: ${getCurrencySymbol(userCurrency)})`;
			selectedFile = null;

			// Reset file input
			const fileInput = document.getElementById('csv-file') as HTMLInputElement;
			if (fileInput) fileInput.value = '';
		} catch (error) {
			console.error('Error importing CSV:', error);
			errorMessage = 'Failed to import CSV file. Please check the format.';
		} finally {
			isImporting = false;
		}
	}

	// Set default date to today
	function setDefaultDate() {
		if (!transactionDate) {
			const today = new Date().toISOString().split('T')[0];
			transactionDate = today;
		}
	}

	onMount(() => {
		setDefaultDate();
	});
</script>

<svelte:head>
	<title>Add Data - Kash</title>
</svelte:head>

<section class="section">
	<div class="container">
		<div class="columns">
			<!-- Sidebar -->
			<Sidebar />
			<!-- Main Content -->
			<div class="column is-9">
				<div class="box has-background-grey-darker">
					<h1 class="title is-2 has-text-white mb-6">Add Transaction Data</h1>
					
					<!-- Currency Display -->
					<div class="notification is-info is-light mb-4">
						<div class="content has-text-centered">
							<p class="has-text-weight-semibold">
								Current Currency: <span class="tag is-warning is-medium">{userCurrency} ({getCurrencySymbol(userCurrency)})</span>
							</p>
							<p class="is-size-7 has-text-grey">
								All transactions will be recorded in {userCurrency}. 
								You can change your preferred currency in your profile settings.
							</p>
						</div>
					</div>

					<!-- Messages -->
					{#if successMessage}
						<div class="notification success-message">
							<button class="delete" on:click={() => (successMessage = '')}></button>
							{successMessage}
						</div>
					{/if}

					{#if errorMessage}
						<div class="notification error-message">
							<button class="delete" on:click={() => (errorMessage = '')}></button>
							{errorMessage}
						</div>
					{/if}

					<div class="columns">
						<!-- Manual Entry Form -->
						<div class="column is-6">
							<div class="box has-background-black">
								<h2 class="title is-4 has-text-white mb-4">Add Manually</h2>

								<form on:submit={handleManualSubmit}>
									<div class="field">
										<label class="label has-text-white">Description</label>
										<div class="control">
											<input
												class="input"
												type="text"
												placeholder="What was this for?"
												bind:value={description}
												required
											/>
										</div>
									</div>

									<div class="field">
										<label class="label has-text-white">
											Amount ({getCurrencySymbol(userCurrency)})
										</label>
										<div class="control">
											<input
												class="input"
												type="number"
												step="0.01"
												placeholder="0.00"
												bind:value={amount}
												required
											/>
										</div>
										<p class="help has-text-grey-light">
											Positive for income, negative for expenses
										</p>
									</div>

									<div class="field">
										<label class="label has-text-white">Type</label>
										<div class="control">
											<div class="select is-fullwidth">
												<select bind:value={transactionType}>
													<option value="expense">Expense</option>
													<option value="income">Income</option>
												</select>
											</div>
										</div>
									</div>

									<div class="field">
										<label class="label has-text-white">Category</label>
										<div class="control">
											<div class="select is-fullwidth">
												<select bind:value={category}>
													{#each categories as cat}
														<option value={cat}>{cat}</option>
													{/each}
												</select>
											</div>
										</div>
									</div>

									<div class="field">
										<label class="label has-text-white">Date</label>
										<div class="control">
											<input
												class="input"
												type="date"
												bind:value={transactionDate}
												on:focus={setDefaultDate}
											/>
										</div>
									</div>

									<div class="field">
										<div class="control">
											<button
												class="button is-warning is-fullwidth {isSubmitting ? 'is-loading' : ''}"
												type="submit"
												disabled={isSubmitting}
											>
												Add Transaction ({getCurrencySymbol(userCurrency)})
											</button>
										</div>
									</div>
								</form>
							</div>
						</div>

						<!-- CSV Import -->
						<div class="column is-6">
							<div class="box has-background-black">
								<h2 class="title is-4 has-text-white mb-4">Import from CSV</h2>

								<div class="content has-text-grey-light">
									<p>Upload a CSV file with the following columns:</p>
									<ul>
										<li><strong>description</strong> (required)</li>
										<li>
											<strong>amount</strong> (required, positive for income, negative for expenses)
										</li>
										<li><strong>date</strong> (required, YYYY-MM-DD format)</li>
										<li><strong>category</strong> (optional)</li>
									</ul>
									<p class="has-text-warning">
										<strong>Note:</strong> All imported transactions will be converted to {userCurrency} ({getCurrencySymbol(userCurrency)})
									</p>
								</div>

								<div class="field">
									<div class="file has-name is-fullwidth">
										<label class="file-label">
											<input
												id="csv-file"
												class="file-input"
												type="file"
												accept=".csv,.txt"
												on:change={handleFileSelect}
											/>
											<span class="file-cta">
												<span class="file-icon">
													<i class="fas fa-upload"></i>
												</span>
												<span class="file-label"> Choose CSV file… </span>
											</span>
											<span class="file-name">
												{selectedFile ? selectedFile.name : 'No file chosen'}
											</span>
										</label>
									</div>
								</div>

								<div class="field">
									<div class="control">
										<button
											class="button is-info is-fullwidth {isImporting ? 'is-loading' : ''}"
											on:click={handleCSVImport}
											disabled={!selectedFile || isImporting}
										>
											Import CSV ({getCurrencySymbol(userCurrency)})
										</button>
									</div>
								</div>

								<!-- Sample CSV Download -->
								<div class="has-text-centered mt-4">
									<a
										class="button is-text has-text-grey-light"
										href="/sample-transactions.csv"
										download
									>
										<span class="icon">
											<i class="fas fa-download"></i>
										</span>
										<span>Download Sample CSV</span>
									</a>
								</div>
							</div>
						</div>
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
		font-family: 'Roboto', 'Arial', sans-serif;
	}

	:global(.box.has-background-grey-darker) {
		background-color: #1a1a1a !important;
		border: 1px solid #333;
	}

	:global(.box.has-background-black) {
		background-color: #000000 !important;
		border: 1px solid #333;
	}

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

	:global(.input),
	:global(.select select) {
		background-color: #333 !important;
		border-color: #444 !important;
		color: white !important;
		font-family: 'Roboto', 'Arial', sans-serif;
	}

	:global(.input:focus),
	:global(.select select:focus) {
		border-color: #ff3e00 !important;
		box-shadow: 0 0 0 0.125em rgba(255, 62, 0, 0.25) !important;
	}

	:global(.input::placeholder) {
		color: #888 !important;
	}

	:global(.file-name) {
		background-color: #333 !important;
		border-color: #444 !important;
		color: white !important;
		font-family: 'Roboto', 'Arial', sans-serif;
	}

	:global(.button.is-warning) {
		background-color: #ff3e00;
		border-color: #ff3e00;
		color: white;
		font-family: 'Roboto', 'Arial', sans-serif;
	}

	:global(.button.is-info) {
		background-color: #3298dc;
		border-color: #3298dc;
		color: white;
		font-family: 'Roboto', 'Arial', sans-serif;
	}

	/* Success Message */
	.success-message {
		background-color: #2ecc71 !important;
		border: 1px solid #27ae60;
		color: white !important;
		font-family: 'Roboto', 'Arial', sans-serif;
		font-weight: 500;
	}

	/* Error Message */
	.error-message {
		background-color: #e74c3c !important;
		border: 1px solid #c0392b;
		color: white !important;
		font-family: 'Roboto', 'Arial', sans-serif;
		font-weight: 500;
	}

	/* Notification text color override */
	:global(.notification) {
		color: white !important;
		font-family: 'Roboto', 'Arial', sans-serif;
	}

	/* Currency notification styling */
	:global(.notification.is-info.is-light) {
		background-color: rgba(32, 156, 238, 0.1) !important;
		border: 1px solid #209cee;
	}

	:global(.tag.is-warning) {
		background-color: #ff3e00 !important;
		color: white !important;
	}
</style>