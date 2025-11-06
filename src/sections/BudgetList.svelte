<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { auth, db } from '$lib/firebase/firebase';
	import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
	import type { User } from '@firebase/auth';

	const dispatch = createEventDispatcher();

	export let budgets: any[] = [];
	export let isLoading: boolean = false;
	export let userCurrency: string = 'INR';
	export let user: User | null = null;

	// Currency symbols
	const currencySymbols: { [key: string]: string } = {
		'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥',
		'CAD': 'C$', 'AUD': 'A$', 'INR': '₹', 'CNY': '¥',
		'CHF': 'CHF', 'BTC': '₿', 'ETH': 'Ξ'
	};

	function getCurrencySymbol(currencyCode: string): string {
		return currencySymbols[currencyCode] || currencyCode;
	}

	// Calculate progress percentage
	function getProgressPercentage(budget: any): number {
		if (budget.amount <= 0) return 0;
		return Math.min(100, (budget.spent / budget.amount) * 100);
	}

	// Get progress bar color based on usage
	function getProgressColor(percentage: number): string {
		if (percentage < 70) return 'is-success';
		if (percentage < 90) return 'is-warning';
		return 'is-danger';
	}

	// Toggle budget active status
	async function toggleBudget(budgetId: string, currentStatus: boolean) {
		if (!user) return;

		try {
			await updateDoc(doc(db, 'users', user.uid, 'budgets', budgetId), {
				isActive: !currentStatus,
				updatedAt: new Date()
			});
			dispatch('budget-updated');
		} catch (error: any) {
			console.error('Error updating budget:', error);
			dispatch('error', error.message || 'Failed to update budget.');
		}
	}

	// Delete budget
	async function deleteBudget(budgetId: string) {
		if (!user || !confirm('Are you sure you want to delete this budget?')) return;

		try {
			await deleteDoc(doc(db, 'users', user.uid, 'budgets', budgetId));
			dispatch('budget-deleted');
		} catch (error: any) {
			console.error('Error deleting budget:', error);
			dispatch('error', error.message || 'Failed to delete budget.');
		}
	}

	// Format period for display
	function formatPeriod(period: string): string {
		const periodMap: { [key: string]: string } = {
			daily: 'Day',
			weekly: 'Week',
			monthly: 'Month',
			yearly: 'Year'
		};
		return periodMap[period] || period;
	}
</script>

<div class="box has-background-black">
	<h2 class="title is-4 has-text-white mb-4">Your Budgets</h2>

	{#if isLoading}
		<div class="has-text-centered py-4">
			<p class="has-text-grey-light">Loading budgets...</p>
		</div>
	{:else if budgets.length === 0}
		<div class="has-text-centered py-4">
			<p class="has-text-grey-light">No budgets created yet.</p>
			<p class="has-text-grey-light is-size-7">Create your first budget to start tracking!</p>
		</div>
	{:else}
		<div class="budgets-list">
			{#each budgets as budget (budget.id)}
				<div class="budget-item box has-background-grey-darker mb-4">
					<div class="level is-mobile">
						<div class="level-left">
							<div>
								<h3 class="title is-5 has-text-white mb-1">{budget.category}</h3>
								<p class="has-text-grey-light is-size-7">
									{budget.description} • {formatPeriod(budget.period)}ly
									{#if !budget.isActive}
										<span class="tag is-danger is-light ml-2">Inactive</span>
									{/if}
								</p>
							</div>
						</div>
						<div class="level-right">
							<div class="buttons">
								<button
									class="button is-small {budget.isActive ? 'is-warning' : 'is-success'}"
									on:click={() => toggleBudget(budget.id, budget.isActive)}
									title={budget.isActive ? 'Pause Budget' : 'Activate Budget'}
								>
									<span class="icon is-small">
										{#if budget.isActive}
											⏸️
										{:else}
											▶️
										{/if}
									</span>
								</button>
								<button
									class="button is-small is-danger"
									on:click={() => deleteBudget(budget.id)}
									title="Delete Budget"
								>
									<span class="icon is-small">🗑️</span>
								</button>
							</div>
						</div>
					</div>

					<!-- Budget Progress -->
					<div class="content">
						<div class="level is-mobile mb-2">
							<div class="level-left">
								<span class="has-text-white">
									{getCurrencySymbol(userCurrency)}{budget.spent.toFixed(2)} spent
								</span>
							</div>
							<div class="level-right">
								<span class="has-text-white">
									{getCurrencySymbol(userCurrency)}{budget.amount.toFixed(2)} budget
								</span>
							</div>
						</div>

						<progress 
							class="progress {getProgressColor(getProgressPercentage(budget))}"
							value={budget.spent}
							max={budget.amount}
						>
							{getProgressPercentage(budget).toFixed(1)}%
						</progress>

						<div class="level is-mobile mt-1">
							<div class="level-left">
								<small class="has-text-grey-light">
									Remaining: {getCurrencySymbol(userCurrency)}{budget.remaining.toFixed(2)}
								</small>
							</div>
							<div class="level-right">
								<small class="has-text-grey-light">
									{getProgressPercentage(budget).toFixed(1)}% used
								</small>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	:global(.box.has-background-black) {
		background-color: #000000 !important;
		border: 1px solid #333;
	}

	.budget-item {
		border: 1px solid #444;
		border-radius: 6px;
		transition: all 0.3s ease;
	}

	.budget-item:hover {
		border-color: #ff3e00;
	}

	:global(.progress) {
		background-color: #333;
		border-radius: 10px;
	}

	:global(.progress::-webkit-progress-bar) {
		background-color: #333;
		border-radius: 10px;
	}

	:global(.progress::-webkit-progress-value) {
		border-radius: 10px;
	}

	:global(.progress.is-success::-webkit-progress-value) {
		background-color: #51cf66;
	}

	:global(.progress.is-warning::-webkit-progress-value) {
		background-color: #ff3e00;
	}

	:global(.progress.is-danger::-webkit-progress-value) {
		background-color: #ff6b6b;
	}
</style>