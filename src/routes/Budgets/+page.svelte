<script lang="ts">
	import { onMount } from 'svelte';
	import { auth, db } from '$lib/firebase/firebase';
	import { onAuthStateChanged, type User } from '@firebase/auth';
	import { 
		collection, 
		addDoc, 
		updateDoc, 
		deleteDoc, 
		doc, 
		onSnapshot, 
		query, 
		where,
		orderBy,
		type DocumentData, 
		getDoc

	} from 'firebase/firestore';
	import { Timestamp } from 'firebase/firestore';
	import Sidebar from '../../sections/Sidebar.svelte';
    import BudgetCreator from '../../sections/BudgetCreator.svelte';
    import BudgetList from '../../sections/BudgetList.svelte';

	// User state
	let user: User | null = null;
	let userCurrency = 'INR';

	// Budgets state
	let budgets: DocumentData[] = [];
	let isLoading = true;
	let errorMessage = '';
	let successMessage = '';

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

	onMount(() => {
		const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
			user = currentUser;
			if (user) {
				loadUserCurrency();
				loadBudgets();
			} else {
				budgets = [];
				isLoading = false;
			}
		});

		return () => unsubscribe();
	});

	// Load budgets from Firestore
	function loadBudgets() {
		if (!user) return;

		isLoading = true;
		const budgetsRef = collection(db, 'users', user.uid, 'budgets');
		const q = query(budgetsRef, orderBy('createdAt', 'desc'));

		const unsubscribe = onSnapshot(q, 
			(snapshot) => {
				budgets = snapshot.docs.map(doc => ({ 
					id: doc.id, 
					...doc.data() 
				}));
				isLoading = false;
			},
			(error) => {
				console.error('Error loading budgets:', error);
				errorMessage = 'Failed to load budgets. Please try again.';
				isLoading = false;
			}
		);

		return unsubscribe;
	}
</script>

<svelte:head>
	<title>Budgets - Kash</title>
</svelte:head>

<section class="section">
	<div class="container">
		<div class="columns">
			<!-- Sidebar -->
			<Sidebar />

			<!-- Main Content -->
			<div class="column is-9">
				<div class="box has-background-grey-darker">
					<h1 class="title is-2 has-text-white mb-6">Budgets</h1>

					<!-- Messages -->
					{#if successMessage}
						<div class="notification is-success">
							<button class="delete" on:click={() => successMessage = ''}></button>
							{successMessage}
						</div>
					{/if}

					{#if errorMessage}
						<div class="notification is-danger">
							<!-- svelte-ignore a11y_consider_explicit_label -->
							<button class="delete" on:click={() => errorMessage = ''}></button>
							{errorMessage}
						</div>
					{/if}

					<div class="columns">
						<!-- Budget Creator -->
						<div class="column is-4">
							<BudgetCreator {user} {userCurrency} {budgets} 
								on:budget-created={() => {
									successMessage = 'Budget created successfully!';
									loadBudgets();
								}}
								on:error={(e) => errorMessage = e.detail}
							/>
						</div>

						<!-- Budgets List -->
						<div class="column is-8">
							<BudgetList {budgets} {isLoading} {userCurrency} {user}
								on:budget-updated={() => {
									successMessage = 'Budget updated successfully!';
									loadBudgets();
								}}
								on:budget-deleted={() => {
									successMessage = 'Budget deleted successfully!';
									loadBudgets();
								}}
								on:error={(e) => errorMessage = e.detail}
							/>
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
	}

	:global(.box.has-background-grey-darker) {
		background-color: #1a1a1a !important;
		border: 1px solid #333;
	}
</style>