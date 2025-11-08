<!-- src/components/RecentTransactions.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { auth, db } from '$lib/firebase/firebase';
    import { onAuthStateChanged, type User } from '@firebase/auth';
    import { collection, query, orderBy, limit, onSnapshot, type QuerySnapshot, type DocumentData } from 'firebase/firestore';
    import { Timestamp } from 'firebase/firestore';

    // Props
    export let userCurrency: string = 'INR'; // Default to Indian Rupees

    // Reactive state for this component
    let user: User | null = null;
    let recentTransactions: DocumentData[] = [];
    let isLoading = true;
    let errorMessage: string | null = null;
    let encryptionKey: CryptoKey | null = null;
    let isEncryptionInitialized = false;

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

    // Get currency symbol for display
    function getCurrencySymbol(currencyCode: string): string {
        return currencySymbols[currencyCode] || currencyCode;
    }

    // Helper to format date for display (e.g., "Today", "2 days ago", "Jan 1, 2023")
    function formatRelativeDate(timestamp: Timestamp): string {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate();
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        // Format as a regular date for transactions older than a week
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // Helper to format amount for display with dynamic currency symbol
    function formatCurrency(amount: number, type: string): { display: string, class: string } {
        const isExpense = type === 'expense';
        const displaySign = isExpense ? '-' : '+';
        const formattedAmount = Math.abs(amount).toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
        const cssClass = isExpense ? 'has-text-danger' : 'has-text-success';
        const currencySymbol = getCurrencySymbol(userCurrency);
        
        return { 
            display: `${displaySign}${currencySymbol}${formattedAmount}`, 
            class: cssClass 
        };
    }

    // Load recent transactions with decryption
    async function loadRecentTransactions() {
        if (!user || !encryptionKey) return;

        isLoading = true;
        const transactionsRef = collection(db, 'users', user.uid, 'transactions');
        const q = query(transactionsRef, orderBy('datePlain', 'desc'), limit(5)); // Fetch 5 most recent

        return onSnapshot(q, 
            async (snapshot: QuerySnapshot<DocumentData>) => {
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

                    recentTransactions = decryptedTransactions;
                } catch (error) {
                    console.error('Error processing recent transactions:', error);
                    errorMessage = 'Failed to load recent transactions. Please check your encryption key.';
                } finally {
                    isLoading = false;
                }
            }, 
            (error) => {
                console.error("Error fetching recent transactions:", error);
                errorMessage = "Failed to load recent transactions. Check your network or permissions.";
                isLoading = false;
            }
        );
    }

    onMount(() => {
        let unsubscribeAuth: () => void;
        let unsubscribeTransactions: (() => void) | undefined;

        // Listen for authentication state changes
        unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            user = currentUser;
            errorMessage = null; // Clear previous errors

            // If user logs out or is not available, clear transactions and stop listening
            if (!user) {
                if (unsubscribeTransactions) {
                    unsubscribeTransactions();
                    unsubscribeTransactions = undefined; // Reset unsubscribe function
                }
                recentTransactions = [];
                isLoading = false;
                encryptionKey = null;
                isEncryptionInitialized = false;
                errorMessage = 'Please log in to view transactions.';
                return;
            }

            // User is logged in, initialize encryption and set up Firestore listener
            try {
                isLoading = true;
                await initializeEncryption();
                unsubscribeTransactions = await loadRecentTransactions();
            } catch (error) {
                console.error('Error initializing user session:', error);
                errorMessage = 'Failed to initialize. Please try refreshing.';
                isLoading = false;
            }
        });

        // Cleanup function for onMount to unsubscribe all listeners
        return () => {
            if (unsubscribeAuth) unsubscribeAuth();
            if (unsubscribeTransactions) unsubscribeTransactions();
        };
    });
</script>

<div class="box has-background-grey-darker mt-5">
	<h2 class="title is-4 has-text-white mb-4">Recent Transactions ({userCurrency})</h2>

    <!-- Encryption Status -->
    {#if user && !isEncryptionInitialized && !isLoading}
        <div class="notification is-warning is-light mb-4">
            <div class="content has-text-centered">
                <p class="has-text-weight-semibold">
                    ⚠️ Encryption Not Initialized
                </p>
                <p class="is-size-7 has-text-grey">
                    Please import your encryption key to view transactions.
                </p>
            </div>
        </div>
    {/if}

	<div class="table-container">
		<table class="table is-fullwidth is-hoverable has-background-black">
			<thead>
				<tr>
					<th class="has-text-grey-light">Description</th>
					<th class="has-text-grey-light">Category</th>
					<th class="has-text-grey-light">Amount</th>
					<th class="has-text-grey-light">Date</th>
				</tr>
			</thead>
			<tbody>
				{#if errorMessage}
					<tr>
						<td colspan="4" class="has-text-danger has-text-centered">{errorMessage}</td>
					</tr>
				{:else if isLoading}
					<tr>
						<td colspan="4" class="has-text-grey-light has-text-centered">
                            {#if !isEncryptionInitialized}
                                Initializing encryption...
                            {:else}
                                Loading recent transactions...
                            {/if}
                        </td>
					</tr>
				{:else if !isEncryptionInitialized}
					<tr>
						<td colspan="4" class="has-text-warning has-text-centered">
                            Encryption not available. Please check your encryption key.
                        </td>
					</tr>
				{:else if recentTransactions.length === 0}
					<tr>
						<td colspan="4" class="has-text-grey-light has-text-centered">No recent transactions found.</td>
					</tr>
				{:else}
					{#each recentTransactions as transaction (transaction.id)}
                        {@const formattedAmount = formatCurrency(transaction.amount, transaction.type)}
						<tr>
							<td class="has-text-white">{transaction.description}</td>
							<td class="has-text-grey-light">{transaction.category}</td>
							<td class={formattedAmount.class}>{formattedAmount.display}</td>
							<td class="has-text-grey-light">{formatRelativeDate(transaction.date)}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	<div class="has-text-centered mt-4">
		<a href="/Transactions" class="button is-warning is-outlined"> View All Transactions </a>
	</div>
</div>

<style>
    /* Ensure the styles are scoped or global as needed */
    :global(.box.has-background-grey-darker) {
        background-color: #1a1a1a !important;
        border: 1px solid #333;
    }

    :global(.box.has-background-black) {
        background-color: #000000 !important;
        border: 1px solid #333;
    }

    :global(.table.has-background-black) {
        background-color: #000000 !important;
    }

    :global(.table.has-background-black th) {
        border-color: #333;
    }

    :global(.table.has-background-black td) {
        border-color: #333;
    }

    :global(.button.is-warning) {
        background-color: #ff3e00;
        border-color: #ff3e00;
        color: white;
    }

    :global(.button.is-warning.is-outlined) {
        background-color: transparent;
        border-color: #ff3e00;
        color: #ff3e00;
    }

    :global(.button.is-warning.is-outlined:hover) {
        background-color: #ff3e00;
        color: white;
    }

    :global(.notification.is-warning.is-light) {
        background-color: rgba(255, 193, 7, 0.1) !important;
        border: 1px solid #ffc107;
    }

    :global(.has-text-warning) {
        color: #ffc107 !important;
    }
</style>