<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { auth, db } from '$lib/firebase/firebase';
	import { collection, addDoc, Timestamp } from 'firebase/firestore';
	import type { User } from '@firebase/auth';

	const dispatch = createEventDispatcher();

	export let user: User | null = null;
	export let userCurrency: string = 'INR';
	export let budgets: any[] = [];

	// Form state
	let category = '';
	let amount = '';
	let period = 'monthly';
	let description = '';
	let isSubmitting = false;

	// Available categories (same as transactions for consistency)
	const categories = [
		'Food & Dining',
		'Transportation',
		'Entertainment',
		'Shopping',
		'Bills & Utilities',
		'Healthcare',
		'Education',
		'Travel',
		'Other'
	];

	// Budget periods
	const periods = [
		{ value: 'daily', label: 'Daily' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'yearly', label: 'Yearly' }
	];

	// Currency symbols
	const currencySymbols: { [key: string]: string } = {
		'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥',
		'CAD': 'C$', 'AUD': 'A$', 'INR': '₹', 'CNY': '¥',
		'CHF': 'CHF', 'BTC': '₿', 'ETH': 'Ξ'
	};

	function getCurrencySymbol(currencyCode: string): string {
		return currencySymbols[currencyCode] || currencyCode;
	}

	// Check if category already has a budget
	function isCategoryTaken(selectedCategory: string): boolean {
		return budgets.some(budget => 
			budget.category === selectedCategory && 
			budget.period === period
		);
	}

	// Create new budget
	async function createBudget(e: Event) {
		e.preventDefault();
		
		if (!user) {
			dispatch('error', 'Please log in to create budgets');
			return;
		}

		if (!category || !amount) {
			dispatch('error', 'Please fill in all required fields');
			return;
		}

		if (isCategoryTaken(category)) {
			dispatch('error', `You already have a ${period} budget for ${category}`);
			return;
		}

		isSubmitting = true;

		try {
			const budgetData = {
				category,
				amount: parseFloat(amount),
				period,
				description: description.trim() || `${category} Budget`,
				currency: userCurrency,
				spent: 0, // Initialize spent amount
				remaining: parseFloat(amount), // Initialize remaining amount
				isActive: true,
				createdAt: Timestamp.now(),
				updatedAt: Timestamp.now()
			};

			await addDoc(collection(db, 'users', user.uid, 'budgets'), budgetData);

			// Reset form
			category = '';
			amount = '';
			period = 'monthly';
			description = '';

			dispatch('budget-created');
		} catch (error: any) {
			console.error('Error creating budget:', error);
			dispatch('error', error.message || 'Failed to create budget. Please try again.');
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="box has-background-black">
	<h2 class="title is-4 has-text-white mb-4">Create New Budget</h2>

	<form on:submit={createBudget}>
		<!-- Category -->
		<div class="field">
			<label class="label has-text-white">Category *</label>
			<div class="control">
				<div class="select is-fullwidth">
					<select bind:value={category} required>
						<option value="">Select a category</option>
						{#each categories as cat}
							<option value={cat}>{cat}</option>
						{/each}
					</select>
				</div>
			</div>
			{#if category && isCategoryTaken(category)}
				<p class="help has-text-danger">
					You already have a {period} budget for {category}
				</p>
			{/if}
		</div>

		<!-- Amount -->
		<div class="field">
			<label class="label has-text-white">
				Budget Amount ({getCurrencySymbol(userCurrency)}) *
			</label>
			<div class="control">
				<input
					class="input"
					type="number"
					step="0.01"
					min="0.01"
					placeholder="0.00"
					bind:value={amount}
					required
				/>
			</div>
		</div>

		<!-- Period -->
		<div class="field">
			<label class="label has-text-white">Budget Period *</label>
			<div class="control">
				<div class="select is-fullwidth">
					<select bind:value={period} required>
						{#each periods as p}
							<option value={p.value}>{p.label}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		<!-- Description -->
		<div class="field">
			<label class="label has-text-white">Description (Optional)</label>
			<div class="control">
				<input
					class="input"
					type="text"
					placeholder="e.g., Monthly food budget"
					bind:value={description}
				/>
			</div>
		</div>

		<!-- Submit Button -->
		<div class="field">
			<div class="control">
				<button
					class="button is-warning is-fullwidth {isSubmitting ? 'is-loading' : ''}"
					type="submit"
					disabled={isSubmitting || !category || !amount || isCategoryTaken(category)}
				>
					Create Budget
				</button>
			</div>
		</div>
	</form>
</div>

<style>
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
</style>