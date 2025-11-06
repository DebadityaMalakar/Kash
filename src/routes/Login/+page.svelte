<script lang="ts">
	import { onMount } from 'svelte';
	import { app, auth } from '$lib/firebase/firebase';
	import { 
		signInWithEmailAndPassword, 
		createUserWithEmailAndPassword,
		signInWithPopup, 
		GoogleAuthProvider,
		sendPasswordResetEmail,
		onAuthStateChanged 
	} from '@firebase/auth';
	import { getCookieValue, setValidationCookie } from '../../utils/cookie';

	let email = '';
	let password = '';
	let isLoading = false;
	let errorMessage = '';
	let successMessage = '';
	let isLoginMode = true;

	const googleProvider = new GoogleAuthProvider();

	// Redirect if already logged in
	onMount(() => {
		if (getCookieValue('accessToken')) {
			window.location.href = '/Dashboard';
		}
		
		onAuthStateChanged(auth, (user) => {
			setValidationCookie('userLoggedIn', user ? 'true' : 'false');
			// @ts-ignore
			setValidationCookie('accessToken', user ? user.accessToken : '');
		});
	});

	// Email/Password authentication
	async function handleEmailAuth(e: Event) {
		e.preventDefault();
		isLoading = true;
		errorMessage = '';
		successMessage = '';

		try {
			if (isLoginMode) {
				await signInWithEmailAndPassword(auth, email, password);
				successMessage = 'Welcome back! Redirecting...';
			} else {
				await createUserWithEmailAndPassword(auth, email, password);
				successMessage = 'Account created successfully! Redirecting...';
			}
			
			setTimeout(() => {
				window.location.href = '/Dashboard';
			}, 1500);
		} catch (error: any) {
			console.error('Authentication error:', error);
			
			switch (error.code) {
				case 'auth/invalid-email':
					errorMessage = 'Please enter a valid email address.';
					break;
				case 'auth/user-disabled':
					errorMessage = 'This account has been disabled.';
					break;
				case 'auth/user-not-found':
					errorMessage = 'No account found with this email.';
					break;
				case 'auth/wrong-password':
					errorMessage = 'Incorrect password. Please try again.';
					break;
				case 'auth/email-already-in-use':
					errorMessage = 'An account with this email already exists.';
					break;
				case 'auth/weak-password':
					errorMessage = 'Password should be at least 6 characters.';
					break;
				default:
					errorMessage = error.message || 'Authentication failed. Please try again.';
			}
		} finally {
			isLoading = false;
		}
	}

	// Google Sign In
	async function handleGoogleSignIn() {
		isLoading = true;
		errorMessage = '';

		try {
			await signInWithPopup(auth, googleProvider);
			successMessage = 'Signed in with Google! Redirecting...';
			setTimeout(() => {
				window.location.href = '/Dashboard';
			}, 1500);
		} catch (error: any) {
			console.error('Google sign-in error:', error);
			errorMessage = 'Google sign-in failed. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	// Password reset
	async function handlePasswordReset() {
		if (!email) {
			errorMessage = 'Please enter your email address to reset password.';
			return;
		}

		isLoading = true;
		errorMessage = '';

		try {
			await sendPasswordResetEmail(auth, email);
			successMessage = 'Password reset email sent! Check your inbox.';
		} catch (error: any) {
			console.error('Password reset error:', error);
			errorMessage = 'Failed to send reset email. Please check your email address.';
		} finally {
			isLoading = false;
		}
	}

	// Toggle between login and signup
	function toggleMode() {
		isLoginMode = !isLoginMode;
		errorMessage = '';
		successMessage = '';
	}
</script>

<svelte:head>
	<title>{isLoginMode ? 'Login' : 'Sign Up'} - Kash</title>
</svelte:head>

<section class="hero is-fullheight login-section">
	<div class="hero-body">
		<div class="container">
			<div class="columns is-centered">
				<div class="column is-5">
					<!-- Login Card -->
					<div class="login-card box has-background-grey-darker">
						<!-- App Logo & Title -->
						<div class="has-text-centered mb-6">
							<div class="app-logo">
								<span class="icon is-large has-text-warning">
									💸
								</span>
							</div>
							<h1 class="title is-2 has-text-white mb-2">Kash</h1>
							<p class="subtitle is-6 has-text-grey-light">
								Smart Money Management for Students
							</p>
						</div>

						<!-- Messages -->
						{#if successMessage}
							<div class="notification is-success">
								<button class="delete" on:click={() => successMessage = ''}></button>
								{successMessage}
							</div>
						{/if}

						{#if errorMessage}
							<div class="notification is-danger">
								<button class="delete" on:click={() => errorMessage = ''}></button>
								{errorMessage}
							</div>
						{/if}

						<!-- Google Sign In -->
						<div class="field">
							<button
								class="button is-fullwidth google-btn {isLoading ? 'is-loading' : ''}"
								on:click={handleGoogleSignIn}
								disabled={isLoading}
							>
								<span class="icon">
									<svg width="18" height="18" viewBox="0 0 18 18">
										<path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
										<path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
										<path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
										<path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
									</svg>
								</span>
								<span>Continue with Google</span>
							</button>
						</div>

						<!-- Divider -->
						<div class="divider">
							<span class="has-text-grey-light">or</span>
						</div>

						<!-- Email/Password Form -->
						<form on:submit={handleEmailAuth}>
							<!-- Email -->
							<div class="field">
								<label class="label has-text-white">Email</label>
								<div class="control">
									<input
										class="input"
										type="email"
										placeholder="Enter your email"
										bind:value={email}
										required
										disabled={isLoading}
									/>
								</div>
							</div>

							<!-- Password -->
							<div class="field">
								<label class="label has-text-white">Password</label>
								<div class="control">
									<input
										class="input"
										type="password"
										placeholder="Enter your password"
										bind:value={password}
										required
										disabled={isLoading}
									/>
								</div>
							</div>

							<!-- Forgot Password -->
							{#if isLoginMode}
								<div class="field">
									<div class="control has-text-right">
										<button
											type="button"
											class="button is-text is-small has-text-grey-light"
											on:click={handlePasswordReset}
											disabled={isLoading}
										>
											Forgot password?
										</button>
									</div>
								</div>
							{/if}

							<!-- Submit Button -->
							<div class="field">
								<div class="control">
									<button
										class="button is-warning is-fullwidth {isLoading ? 'is-loading' : ''}"
										type="submit"
										disabled={isLoading}
									>
										{isLoginMode ? 'Sign In' : 'Create Account'}
									</button>
								</div>
							</div>
						</form>

						<!-- Toggle Mode -->
						<div class="has-text-centered mt-4">
							<p class="has-text-grey-light">
								{isLoginMode ? "Don't have an account?" : "Already have an account?"}
								<button
									type="button"
									class="button is-text is-small has-text-warning ml-1"
									on:click={toggleMode}
									disabled={isLoading}
								>
									{isLoginMode ? 'Sign Up' : 'Sign In'}
								</button>
							</p>
						</div>
					</div>

					<!-- Features List -->
					<div class="features-box box has-background-black mt-5">
						<h3 class="title is-5 has-text-white has-text-centered mb-4">Why Choose Kash?</h3>
						<div class="content has-text-grey-light">
							<div class="features-list">
								<div class="feature-item">
									<span class="icon has-text-warning">📊</span>
									<span>Track spending with beautiful analytics</span>
								</div>
								<div class="feature-item">
									<span class="icon has-text-warning">💰</span>
									<span>Set and manage budgets easily</span>
								</div>
								<div class="feature-item">
									<span class="icon has-text-warning">🎯</span>
									<span>Achieve your financial goals</span>
								</div>
								<div class="feature-item">
									<span class="icon has-text-warning">🔒</span>
									<span>Your data is always secure</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Footer -->
	<div class="hero-footer">
		<div class="container">
			<div class="content has-text-centered">
				<p class="has-text-grey-light is-size-7">
					&copy; 2024 Kash. Made with ❤️ for students.
				</p>
			</div>
		</div>
	</div>
</section>

<style>
	.hero.is-fullheight {
		min-height: 100vh;
	}

	.login-section {
		background: linear-gradient(135deg, #1a1a1a 0%, #000000 100%);
		position: relative;
		overflow: hidden;
	}

	.login-section::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: 
			radial-gradient(circle at 20% 80%, rgba(255, 62, 0, 0.1) 0%, transparent 50%),
			radial-gradient(circle at 80% 20%, rgba(255, 106, 51, 0.1) 0%, transparent 50%),
			radial-gradient(circle at 40% 40%, rgba(50, 152, 220, 0.05) 0%, transparent 50%);
		pointer-events: none;
	}

	.login-card {
		border: 1px solid #333;
		border-radius: 12px;
		padding: 2.5rem;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
		position: relative;
		z-index: 1;
	}

	.app-logo {
		margin-bottom: 1rem;
	}

	.app-logo .icon {
		font-size: 3rem;
	}

	.google-btn {
		background: white;
		color: #333;
		border: 1px solid #ddd;
		font-weight: 500;
		transition: all 0.3s ease;
	}

	.google-btn:hover {
		background: #f8f9fa;
		border-color: #ccc;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.divider {
		display: flex;
		align-items: center;
		text-align: center;
		margin: 1.5rem 0;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		border-bottom: 1px solid #333;
	}

	.divider span {
		padding: 0 1rem;
		font-size: 0.9rem;
	}

	:global(.box.has-background-grey-darker) {
		background-color: #1a1a1a !important;
	}

	:global(.box.has-background-black) {
		background-color: #000000 !important;
		border: 1px solid #333;
	}

	:global(.input) {
		background-color: #333 !important;
		border-color: #444 !important;
		color: white !important;
		font-size: 1rem;
		height: 3rem;
	}

	:global(.input:focus) {
		border-color: #ff3e00 !important;
		box-shadow: 0 0 0 0.125em rgba(255, 62, 0, 0.25) !important;
	}

	:global(.input::placeholder) {
		color: #888 !important;
	}

	:global(.button.is-warning) {
		background-color: #ff3e00;
		border-color: #ff3e00;
		color: white;
		font-weight: 600;
		height: 3rem;
		font-size: 1rem;
		transition: all 0.3s ease;
	}

	:global(.button.is-warning:hover) {
		background-color: #ff6a33;
		border-color: #ff6a33;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(255, 62, 0, 0.3);
	}

	:global(.button.is-text.has-text-warning) {
		color: #ff3e00 !important;
	}

	:global(.button.is-text.has-text-warning:hover) {
		color: #ff6a33 !important;
		background-color: transparent;
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

	.features-box {
		border-radius: 12px;
	}

	.features-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.feature-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0;
	}

	.feature-item .icon {
		font-size: 1.25rem;
		width: 1.5rem;
	}

	.hero-footer {
		padding: 2rem 0;
		border-top: 1px solid #333;
		margin-top: 2rem;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.login-card {
			padding: 2rem 1.5rem;
			margin: 0 1rem;
		}

		.app-logo .icon {
			font-size: 2.5rem;
		}

		.title.is-2 {
			font-size: 1.75rem;
		}
	}

	/* Loading animation */
	@keyframes pulse {
		0% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
		100% {
			opacity: 1;
		}
	}

	:global(.is-loading) {
		animation: pulse 1.5s ease-in-out infinite;
	}
</style>