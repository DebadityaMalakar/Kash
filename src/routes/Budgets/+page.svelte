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

	// Mobile state
	let isMobile = false;

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

	// Check screen size
	function checkScreenSize() {
		isMobile = window.innerWidth < 1024;
	}

	onMount(() => {
		// Check initial screen size
		checkScreenSize();
		window.addEventListener('resize', checkScreenSize);

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

		return () => {
			unsubscribe();
			window.removeEventListener('resize', checkScreenSize);
		};
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
								<h1 class="title is-4 has-text-white mb-0">Budgets</h1>
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
						<h1 class="title is-2 has-text-white mb-6">Budgets</h1>
					{/if}

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

					<div class="columns {isMobile ? 'is-multiline' : ''}">
						<!-- Budget Creator -->
						<div class="column {isMobile ? 'is-12' : 'is-4'}">
							<BudgetCreator {user} {userCurrency} {budgets} 
								on:budget-created={() => {
									successMessage = 'Budget created successfully!';
									loadBudgets();
								}}
								on:error={(e) => errorMessage = e.detail}
							/>
						</div>

						<!-- Budgets List -->
						<div class="column {isMobile ? 'is-12' : 'is-8'}">
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

							<div class="bottom-nav-item">
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

							<div class="bottom-nav-item active">
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

	:global(.button.is-warning) {
		background-color: #ff3e00;
		border-color: #ff3e00;
		color: white;
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

	/* Mobile optimizations */
	@media (max-width: 768px) {
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

		.columns.is-multiline .column {
			margin-bottom: 1rem;
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

	/* Global styles for consistency */
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

	:global(.notification.is-success) {
		background-color: rgba(81, 207, 102, 0.1) !important;
		border: 1px solid #51cf66;
		color: #51cf66 !important;
	}

	:global(.notification.is-danger) {
		background-color: rgba(255, 107, 107, 0.1) !important;
		border: 1px solid #ff6b6b;
		color: #ff6b6b !important;
	}
</style>