<script lang="ts">
	import { onMount } from 'svelte';
	import { app, auth, db } from '$lib/firebase/firebase';
	import { getAuth, onAuthStateChanged, type User } from '@firebase/auth';
	import { doc, getDoc, collection, query, where, onSnapshot, type DocumentData } from 'firebase/firestore';
	import { getCookieValue } from '../../utils/cookie';
	import Sidebar from '../../sections/Sidebar.svelte';
	import TransactionHistory from '../../sections/Transaction-History.svelte';

	// Reactive variables
	let user: User | null = null;
	let username = 'User';
	let email = 'No Email';
	let photoURL = '/favicon.svg';
	let userCurrency = 'INR';

	// Dashboard stats
	let activeBudgets = 0;
	let totalTransactions = 0;
	let totalSpent = 0;
	let isLoading = true;
	let isMobile = false;

	// Currency symbols mapping
	const currencySymbols: { [key: string]: string } = {
		'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥',
		'CAD': 'C$', 'AUD': 'A$', 'INR': '₹', 'CNY': '¥',
		'CHF': 'CHF', 'BTC': '₿', 'ETH': 'Ξ'
	};

	// Check screen size
	function checkScreenSize() {
		isMobile = window.innerWidth < 1024; // Tablet and mobile
	}

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
				userCurrency = userData.currency || 'INR';
			}
		} catch (error) {
			console.error('Error loading user currency:', error);
		}
	}

	// Load dashboard stats
	function loadDashboardStats() {
		if (!user) return;

		isLoading = true;

		// Load active budgets
		const budgetsRef = collection(db, 'users', user.uid, 'budgets');
		const activeBudgetsQuery = query(budgetsRef, where('isActive', '==', true));

		const unsubscribeBudgets = onSnapshot(activeBudgetsQuery, 
			(snapshot) => {
				activeBudgets = snapshot.size;
				updateLoadingState();
			},
			(error) => {
				console.error('Error loading budgets:', error);
				updateLoadingState();
			}
		);

		// Load transactions and calculate total spent
		const transactionsRef = collection(db, 'users', user.uid, 'transactions');
		
		const unsubscribeTransactions = onSnapshot(transactionsRef, 
			(snapshot) => {
				totalTransactions = snapshot.size;
				
				// Calculate total spent (only expenses, not income)
				const spent = snapshot.docs
					.map(doc => doc.data())
					.filter(transaction => transaction.type === 'expense')
					.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
				
				totalSpent = spent;
				updateLoadingState();
			},
			(error) => {
				console.error('Error loading transactions:', error);
				updateLoadingState();
			}
		);

		function updateLoadingState() {
			// Only set loading to false after we have attempted to load both
			setTimeout(() => {
				isLoading = false;
			}, 500);
		}

		return () => {
			unsubscribeBudgets();
			unsubscribeTransactions();
		};
	}

	// Function to update user info
	async function updateUserInfo(currentUser: User | null) {
		user = currentUser;
		if (user) {
			username = user.displayName || 'User';
			email = user.email || 'No Email';
			photoURL = user.photoURL || '/favicon.svg';
			
			// Load user currency preference
			await loadUserCurrency();
			// Load dashboard stats
			loadDashboardStats();
		} else {
			// Redirect to login if not authenticated
			console.log('No user found, redirecting to login');
			window.location.href = '/Login';
		}
	}

	onMount(() => {
		// Check initial authentication state using cookies first
		const accessToken = getCookieValue('accessToken');
		const userLoggedIn = getCookieValue('userLoggedIn');
		
		//console.log('Dashboard mount - Cookie check:', { accessToken, userLoggedIn });
		
		if (!accessToken || userLoggedIn !== 'true') {
			console.log('No valid auth cookies, redirecting to login');
			window.location.href = '/Login';
			return;
		}

		// Check initial screen size
		checkScreenSize();
		
		// Listen for screen resize
		window.addEventListener('resize', checkScreenSize);

		// Set initial state from Firebase auth
		const currentUser = getAuth(app).currentUser;
		
		if (!currentUser) {
			console.log('No Firebase user, redirecting to login');
			window.location.href = '/Login';
			return;
		}

		updateUserInfo(currentUser);

		// Listen for auth state changes
		const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
			console.log('Auth state changed:', currentUser);
			if (!currentUser) {
				console.log('User signed out, redirecting to login');
				window.location.href = '/Login';
				return;
			}
			updateUserInfo(currentUser);
		});

		// Cleanup subscription
		return () => {
			unsubscribe();
			window.removeEventListener('resize', checkScreenSize);
		};
	});
</script>

<svelte:head>
	<title>Dashboard</title>
</svelte:head>

{#if user}
	<section class="section">
		<div class="container">
			<div class="columns">
				<!-- Sidebar - Hidden on mobile, shown on desktop -->
				{#if !isMobile}
					<Sidebar />
				{/if}

				<!-- Main Content -->
				<div class="column {isMobile ? 'is-12' : 'is-9'}">
					<!-- Mobile Header with Menu Toggle -->
					{#if isMobile}
						<div class="mobile-header box has-background-grey-darker mb-4">
							<div class="level is-mobile">
								<div class="level-left">
									<div class="media">
										<div class="media-left">
											<figure class="image is-48x48">
												<img class="is-rounded" src={photoURL} alt="Profile" />
											</figure>
										</div>
										<div class="media-content">
											<p class="title is-4 has-text-white mb-1">Welcome back!</p>
											<p class="subtitle is-7 has-text-grey-light">{username}</p>
										</div>
									</div>
								</div>
								<div class="level-right">
									<a href="/Profile" class="button is-warning is-small">
										<span class="icon">👤</span>
									</a>
								</div>
							</div>
						</div>
					{/if}

					<!-- Profile Section -->
					<div class="box has-background-grey-darker has-text-white">
						{#if !isMobile}
							<div class="media">
								<div class="media-left">
									<figure class="image is-64x64">
										<img class="is-rounded" src={photoURL} alt="Profile" />
									</figure>
								</div>
								<div class="media-content">
									<p class="title is-3 has-text-white">Welcome back, {username}! 👋</p>
									<p class="subtitle is-6 has-text-grey-light">{email}</p>
									<p class="subtitle is-7 has-text-grey-light">
										Currency: <span class="has-text-warning">{userCurrency} ({getCurrencySymbol(userCurrency)})</span>
									</p>
								</div>
							</div>
						{/if}

						<!-- Stats Cards -->
						<div class="columns is-mobile is-multiline has-text-centered mt-4">
							<!-- Active Budgets -->
							<div class="column {isMobile ? 'is-4' : ''}">
								{#if isLoading}
									<div class="skeleton-loader {isMobile ? 'skeleton-mobile' : ''}"></div>
									<p class="subtitle is-6 has-text-grey-light">Loading...</p>
								{:else}
									<p class="title {isMobile ? 'is-5' : 'is-4'} has-text-warning">{activeBudgets}</p>
									<p class="subtitle is-6 has-text-grey-light">
										{isMobile ? 'Budgets' : 'Active Budget'}{activeBudgets !== 1 && !isMobile ? 's' : ''}
									</p>
								{/if}
							</div>

							<!-- Total Transactions -->
							<div class="column {isMobile ? 'is-4' : ''}">
								{#if isLoading}
									<div class="skeleton-loader {isMobile ? 'skeleton-mobile' : ''}"></div>
									<p class="subtitle is-6 has-text-grey-light">Loading...</p>
								{:else}
									<p class="title {isMobile ? 'is-5' : 'is-4'} has-text-warning">{totalTransactions}</p>
									<p class="subtitle is-6 has-text-grey-light">
										{isMobile ? 'Txns' : 'Transaction'}{totalTransactions !== 1 && !isMobile ? 's' : ''}
									</p>
								{/if}
							</div>

							<!-- Total Spent -->
							<div class="column {isMobile ? 'is-4' : ''}">
								{#if isLoading}
									<div class="skeleton-loader {isMobile ? 'skeleton-mobile' : ''}"></div>
									<p class="subtitle is-6 has-text-grey-light">Loading...</p>
								{:else}
									<p class="title {isMobile ? 'is-5' : 'is-4'} has-text-warning">
										{isMobile ? getCurrencySymbol(userCurrency) : ''}{totalSpent.toFixed(isMobile ? 0 : 2)}
									</p>
									<p class="subtitle is-6 has-text-grey-light">
										{isMobile ? 'Spent' : 'Total Spent'}
									</p>
								{/if}
							</div>
						</div>

						<!-- Budget Progress Overview -->
						{#if !isLoading && activeBudgets > 0}
							<div class="mt-4">
								<h3 class="title {isMobile ? 'is-6' : 'is-5'} has-text-white mb-2">Budget Overview</h3>
								<div class="budget-overview">
									<p class="has-text-grey-light {isMobile ? 'is-size-8' : 'is-size-7'}">
										You have {activeBudgets} active budget{activeBudgets !== 1 ? 's' : ''}. 
										<a href="/Budgets" class="has-text-warning">Manage budgets</a>
									</p>
								</div>
							</div>
						{:else if !isLoading && activeBudgets === 0}
							<div class="mt-4">
								<div class="notification is-info is-light {isMobile ? 'is-small' : ''}">
									<div class="content {isMobile ? 'is-small' : ''}">
										<p class="has-text-weight-semibold">No active budgets yet</p>
										<p class="{isMobile ? 'is-size-7' : ''}">
											Create your first budget to start tracking your spending goals!
										</p>
										<a href="/Budgets" class="button is-warning {isMobile ? 'is-small' : ''} mt-2">
											Create Budget
										</a>
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Transaction History Section -->
					<div class="transaction-section {isMobile ? 'mobile-transaction' : ''}">
						<TransactionHistory {userCurrency} />
					</div>

					<!-- Modern Mobile Bottom Navigation -->
					{#if isMobile}
						<div class="modern-bottom-nav">
							<nav class="bottom-nav-container">
								<div class="bottom-nav-item active">
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

	.mobile-header {
		padding: 1rem;
	}

	.mobile-header .media {
		align-items: center;
	}

	.mobile-header .image.is-48x48 {
		width: 48px;
		height: 48px;
	}

	/* Stats cards mobile optimization */
	.columns.is-mobile .column {
		padding: 0.5rem;
	}

	/* Skeleton loader for loading states */
	.skeleton-loader {
		width: 60px;
		height: 36px;
		background: linear-gradient(90deg, #333 25%, #444 50%, #333 75%);
		background-size: 200% 100%;
		animation: loading 1.5s infinite;
		border-radius: 4px;
		margin: 0 auto;
	}

	.skeleton-mobile {
		width: 40px;
		height: 28px;
	}

	@keyframes loading {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	.budget-overview {
		border-top: 1px solid #333;
		padding-top: 1rem;
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

	/* Transaction section mobile optimization */
	.transaction-section.mobile-transaction :global(.box) {
		margin-bottom: 0;
	}

	.transaction-section.mobile-transaction :global(.table) {
		font-size: 0.875rem;
	}

	.transaction-section.mobile-transaction :global(.table th),
	.transaction-section.mobile-transaction :global(.table td) {
		padding: 0.5rem 0.25rem;
	}

	/* Responsive text sizes */
	@media (max-width: 768px) {
		:global(.title.is-3) {
			font-size: 1.5rem;
		}

		:global(.title.is-4) {
			font-size: 1.25rem;
		}

		:global(.title.is-5) {
			font-size: 1.125rem;
		}

		:global(.subtitle.is-6) {
			font-size: 0.875rem;
		}

		:global(.subtitle.is-7) {
			font-size: 0.75rem;
		}

		/* Adjust bottom nav for very small screens */
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
		.columns.is-mobile .column {
			padding: 0.25rem;
		}

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

	:global(.table) {
		background-color: #1a1a1a !important;
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

	:global(.button.is-warning) {
		background-color: #ff3e00;
		border-color: #ff3e00;
		color: white;
	}

	:global(.notification.is-info.is-light) {
		background-color: rgba(32, 156, 238, 0.1) !important;
		border: 1px solid #209cee;
		color: #209cee !important;
	}
</style>