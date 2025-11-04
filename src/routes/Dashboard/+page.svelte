<script lang="ts">
	import { onMount } from 'svelte';
	import { app, auth, db } from '$lib/firebase/firebase';
	import { getAuth, onAuthStateChanged, type User } from '@firebase/auth';
	import { doc, getDoc } from 'firebase/firestore';
	import Sidebar from '../../sections/Sidebar.svelte';
	import TransactionHistory from '../../sections/Transaction-History.svelte';

	// Reactive variables
	let user: User | null = null;
	let username = 'User';
	let email = 'No Email';
	let photoURL = '/favicon.svg';
	let userCurrency = 'INR'; // Default to Indian Rupees

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

	// Function to update user info
	async function updateUserInfo(currentUser: User | null) {
		user = currentUser;
		if (user) {
			username = user.displayName || 'User';
			email = user.email || 'No Email';
			photoURL = user.photoURL || '/favicon.svg';
			console.log('User info updated:', username);
			
			// Load user currency preference
			await loadUserCurrency();
		} else {
			username = 'User';
			email = 'No Email';
			photoURL = '/favicon.svg';
			userCurrency = 'INR'; // Reset to default
		}
	}

	onMount(() => {
		// Set initial state
		const currentUser = getAuth(app).currentUser;
		updateUserInfo(currentUser);

		// Listen for auth state changes
		const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
			updateUserInfo(currentUser);
		});

		// Cleanup subscription
		return () => unsubscribe();
	});
</script>

<svelte:head>
	<title>Dashboard</title>
</svelte:head>

<section class="section">
	<div class="container">
		<div class="columns">
			<!-- Sidebar -->
			 <Sidebar />

			<!-- Main Content -->
			<div class="column is-9">
				<!-- Profile Section -->
				<div class="box has-background-grey-darker has-text-white">
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

					<div class="columns is-mobile has-text-centered mt-5">
						<div class="column">
							<p class="title is-4 has-text-warning">3</p>
							<p class="subtitle is-6 has-text-grey-light">Active Budgets</p>
						</div>
						<div class="column">
							<p class="title is-4 has-text-warning">12</p>
							<p class="subtitle is-6 has-text-grey-light">Transactions</p>
						</div>
						<div class="column">
							<p class="title is-4 has-text-warning">
								{getCurrencySymbol(userCurrency)}245
							</p>
							<p class="subtitle is-6 has-text-grey-light">Total Spent</p>
						</div>
					</div>
				</div>

				<!-- Transaction History Section -->
				<!--@ts-ignore-->
				<TransactionHistory {userCurrency} />
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

	:global(.button.is-warning.is-outlined) {
		background-color: transparent;
		border-color: #ff3e00;
		color: #ff3e00;
	}

	:global(.button.is-warning.is-outlined:hover) {
		background-color: #ff3e00;
		color: white;
	}
</style>