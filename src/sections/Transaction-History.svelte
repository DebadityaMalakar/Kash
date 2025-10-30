<!-- src/components/RecentTransactions.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { auth, db } from '$lib/firebase/firebase'; // Ensure these are correctly imported from your firebase.ts
    import { onAuthStateChanged, type User } from '@firebase/auth';
    import { collection, query, orderBy, limit, onSnapshot, type QuerySnapshot, type DocumentData } from 'firebase/firestore';
    import { Timestamp } from 'firebase/firestore'; // Import Timestamp for type safety

    // Reactive state for this component
    let user: User | null = null;
    let recentTransactions: DocumentData[] = [];
    let isLoading = true;
    let errorMessage: string | null = null;

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

    // Helper to format amount for display (e.g., "+$2,500.00", "-$85.40") and determine CSS class
    function formatCurrency(amount: number, type: string): { display: string, class: string } {
        const isExpense = type === 'expense';
        const displaySign = isExpense ? '-' : '+';
        const formattedAmount = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const cssClass = isExpense ? 'has-text-danger' : 'has-text-success';
        return { display: `${displaySign}$${formattedAmount}`, class: cssClass };
    }

    onMount(() => {
        let unsubscribeAuth: () => void;
        let unsubscribeTransactions: (() => void) | undefined;

        // Listen for authentication state changes
        unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
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
                errorMessage = 'Please log in to view transactions.';
                return;
            }

            // User is logged in, set up Firestore listener
            isLoading = true;
            const transactionsRef = collection(db, 'users', user.uid, 'transactions');
            const q = query(transactionsRef, orderBy('date', 'desc'), limit(5)); // Fetch 5 most recent

            unsubscribeTransactions = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
                recentTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                isLoading = false;
            }, (error) => {
                console.error("Error fetching recent transactions:", error);
                errorMessage = "Failed to load recent transactions. Check your network or permissions.";
                isLoading = false;
            });
        });

        // Cleanup function for onMount to unsubscribe all listeners
        return () => {
            if (unsubscribeAuth) unsubscribeAuth();
            if (unsubscribeTransactions) unsubscribeTransactions();
        };
    });
</script>

<div class="box has-background-grey-darker mt-5">
	<h2 class="title is-4 has-text-white mb-4">Recent Transactions</h2>

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
						<td colspan="4" class="has-text-grey-light has-text-centered">Loading recent transactions...</td>
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
		<a href="/transactions" class="button is-warning is-outlined"> View All Transactions </a>
	</div>
</div>

<style>
    /* Ensure the styles are scoped or global as needed */
    /* If this is within a global style context (e.g., app.css), you might not need to repeat them here.
       Otherwise, ensure they are present or imported. */
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
</style>
