<script lang="ts">
	import { onMount } from 'svelte';
	import { app, auth, db, storage } from '$lib/firebase/firebase';
	import { getAuth, onAuthStateChanged, type User } from '@firebase/auth';
	import { collection, addDoc, Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
	import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
	import Sidebar from '../../sections/Sidebar.svelte';

	// User state
	let user: User | null = null;
	let userCurrency = 'INR';
	let encryptionKey: CryptoKey | null = null;
	let isEncryptionInitialized = false;

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

	// Key management state
	let showKeyExportModal = false;
	let exportedKeyString = '';
	let importKeyString = '';
	let isExportingKey = false;
	let isImportingKey = false;

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

	async function encryptData(data: string): Promise<{ encrypted: string; iv: string }> {
		if (!encryptionKey) {
			throw new Error('Encryption key not available');
		}

		const encoder = new TextEncoder();
		const dataBuffer = encoder.encode(data);
		
		const iv = crypto.getRandomValues(new Uint8Array(12));
		
		const encryptedBuffer = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv: iv,
			},
			encryptionKey,
			dataBuffer
		);

		const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
		const ivBase64 = btoa(String.fromCharCode(...iv));

		return {
			encrypted: encryptedBase64,
			iv: ivBase64
		};
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
				await storeEncryptionKeyInFirestore(exportedKey);
			}
			
			isEncryptionInitialized = true;
		} catch (error) {
			console.error('Error initializing encryption:', error);
			isEncryptionInitialized = false;
			throw new Error('Failed to initialize encryption');
		}
	}

	// Store encrypted key in Firestore for backup
	async function storeEncryptionKeyInFirestore(keyString: string) {
		if (!user) return;
		
		try {
			await setDoc(doc(db, 'users', user.uid), {
				encryptionKey: keyString,
				keyBackupDate: Timestamp.now(),
				updatedAt: Timestamp.now()
			}, { merge: true });
		} catch (error) {
			console.error('Error storing encryption key in Firestore:', error);
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
			
			await storeEncryptionKeyInFirestore(importKeyString.trim());
			
			successMessage = 'Encryption key imported successfully!';
			showKeyExportModal = false;
			importKeyString = '';
		} catch (error) {
			console.error('Error importing key:', error);
			errorMessage = 'Invalid encryption key format';
		} finally {
			isImportingKey = false;
		}
	}

	// Load user currency preference and initialize encryption
	async function loadUserPreferences() {
		if (!user) return;
		
		try {
			await initializeEncryption();

			const userDoc = await getDoc(doc(db, 'users', user.uid));
			if (userDoc.exists()) {
				const userData = userDoc.data();
				userCurrency = userData.currency || 'INR';
			}
		} catch (error) {
			console.error('Error loading user preferences:', error);
		}
	}

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
			user = currentUser;
			if (user) {
				loadUserPreferences();
			} else {
				encryptionKey = null;
				isEncryptionInitialized = false;
			}
		});
		return () => unsubscribe();
	});

	// Manual transaction submission with encryption
	async function handleManualSubmit(e: Event) {
		e.preventDefault();
		if (!user || !encryptionKey) {
			errorMessage = 'Please log in to add transactions';
			return;
		}

		isSubmitting = true;
		errorMessage = '';
		successMessage = '';

		try {
			const amountEncrypted = await encryptData(amount);
			const dateEncrypted = await encryptData(transactionDate || new Date().toISOString().split('T')[0]);

			const transactionData = {
				userId: user.uid,
				description: description.trim(),
				amount: amountEncrypted.encrypted,
				amountIv: amountEncrypted.iv,
				date: dateEncrypted.encrypted,
				dateIv: dateEncrypted.iv,
				amountPlain: parseFloat(amount),
				datePlain: transactionDate ? Timestamp.fromDate(new Date(transactionDate)) : Timestamp.now(),
				category: category || 'Other',
				type: transactionType,
				currency: userCurrency,
				createdAt: Timestamp.now(),
				updatedAt: Timestamp.now()
			};

			await addDoc(collection(db, 'users', user.uid, 'transactions'), transactionData);

			successMessage = `Transaction added successfully! (Currency: ${getCurrencySymbol(userCurrency)})`;
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

	// CSV import handler with encryption
	async function handleCSVImport() {
		if (!selectedFile) {
			errorMessage = 'Please select a CSV file';
			return;
		}

		if (!user || !encryptionKey) {
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

			const requiredHeaders = ['description', 'amount', 'date'];
			const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

			if (missingHeaders.length > 0) {
				errorMessage = `Missing required columns: ${missingHeaders.join(', ')}`;
				return;
			}

			let importedCount = 0;
			let errorCount = 0;

			for (let i = 1; i < lines.length; i++) {
				try {
					const values = lines[i].split(',').map((v) => v.trim());
					const row: any = {};

					headers.forEach((header, index) => {
						row[header] = values[index] || '';
					});

					const amountEncrypted = await encryptData(row.amount || '0');
					const dateEncrypted = await encryptData(row.date || new Date().toISOString().split('T')[0]);

					const transactionData = {
						userId: user.uid,
						description: row.description || 'Imported Transaction',
						amount: amountEncrypted.encrypted,
						amountIv: amountEncrypted.iv,
						date: dateEncrypted.encrypted,
						dateIv: dateEncrypted.iv,
						amountPlain: parseFloat(row.amount) || 0,
						datePlain: row.date ? Timestamp.fromDate(new Date(row.date)) : Timestamp.now(),
						category: row.category || 'Other',
						type: (parseFloat(row.amount) || 0) >= 0 ? 'income' : 'expense',
						currency: userCurrency,
						createdAt: Timestamp.now(),
						updatedAt: Timestamp.now()
					};

					if (transactionData.description && !isNaN(transactionData.amountPlain)) {
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
										? 'Amount and date fields are encrypted using AES-GCM before storage'
										: 'Setting up encryption system...'}
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
												disabled={isSubmitting || !isEncryptionInitialized}
											>
												{isEncryptionInitialized ? `Add Transaction (${getCurrencySymbol(userCurrency)})` : 'Initializing Encryption...'}
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
									<p class="has-text-info">
										<strong>Encryption:</strong> Amount and date fields will be encrypted before storage
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
											disabled={!selectedFile || isImporting || !isEncryptionInitialized}
										>
											{isEncryptionInitialized ? `Import CSV (${getCurrencySymbol(userCurrency)})` : 'Initializing Encryption...'}
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
</style>