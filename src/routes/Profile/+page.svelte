<script lang="ts">
    import { onMount } from "svelte";
    import { app, auth, db } from "$lib/firebase/firebase"
    import { getAuth, onAuthStateChanged, type User } from '@firebase/auth';
    import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
	import Sidebar from "../../sections/Sidebar.svelte";
    
    // Reactive variables
    let user: User | null = null;
    let username = 'User';
    let email = 'No Email';
    let photoURL = '/favicon.svg';
    let currency = 'INR'; // Default to INR for Indian users
    let userId = '';
    let hasExistingUserId = false;
    let showUserIdPopup = false;

    // Mobile state
    let isMobile = false;

    // Form state
    let isEditing = false;
    let isSubmitting = false;
    let successMessage = '';
    let errorMessage = '';
    
    // Form fields
    let newUsername = '';
    let newEmail = '';
    let newCurrency = 'INR';
    let customUserId = '';

    // Popup state
    let popupUserId = '';
    let isSettingUpUserId = false;
    let popupError = '';

    // Currency data
    let currencies: Record<string, string> = {};
    let isLoadingCurrencies = false;
    let currencyError = '';

    // Check screen size
    function checkScreenSize() {
        isMobile = window.innerWidth < 1024;
    }

    // Generate cryptographically secure random ID
    function generateSecureId(): string {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // Validate user ID format and check availability
    async function validateUserId(proposedId: string): Promise<{ valid: boolean; message: string }> {
        // Basic validation
        if (!proposedId || proposedId.length < 3) {
            return { valid: false, message: 'User ID must be at least 3 characters long' };
        }
        
        if (proposedId.length > 20) {
            return { valid: false, message: 'User ID must be less than 20 characters' };
        }
        
        if (!/^[a-zA-Z0-9_-]+$/.test(proposedId)) {
            return { valid: false, message: 'User ID can only contain letters, numbers, underscores, and hyphens' };
        }

        // Check if ID is already in use
        try {
            const userDoc = await getDoc(doc(db, 'userIds', proposedId.toLowerCase()));
            
            // With restrictive rules, we can only check if document exists, not read its content
            if (userDoc.exists()) {
                return { valid: false, message: 'This User ID is already taken' };
            }
            
            return { valid: true, message: 'User ID is available' };
        } catch (error: any) {
            console.error('Error validating user ID:', error);
            
            // Handle permission errors gracefully
            if (error.code === 'permission-denied') {
                return { 
                    valid: false, 
                    message: 'Unable to check User ID availability. Please try again.' 
                };
            }
            
            return { 
                valid: false, 
                message: 'Error checking User ID availability. Please try again.' 
            };
        }
    }

    // Function to fetch currencies from the API with fallback
    async function fetchCurrencies() {
        isLoadingCurrencies = true;
        currencyError = '';
        
        const endpoints = [
            'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.min.json',
            'https://latest.currency-api.pages.dev/v1/currencies.min.json'
        ];

        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint);
                if (response.ok) {
                    currencies = await response.json();
                    isLoadingCurrencies = false;
                    return;
                }
            } catch (error) {
                console.warn(`Failed to fetch from ${endpoint}:`, error);
                continue;
            }
        }
        
        // If all endpoints fail, use a fallback list
        currencyError = 'Failed to load currency list. Using basic currencies.';
        currencies = {
            usd: 'United States Dollar',
            eur: 'Euro',
            gbp: 'British Pound Sterling',
            jpy: 'Japanese Yen',
            cad: 'Canadian Dollar',
            aud: 'Australian Dollar',
            chf: 'Swiss Franc',
            cny: 'Chinese Yuan',
            inr: 'Indian Rupee',
            btc: 'Bitcoin',
            eth: 'Ethereum'
        };
        isLoadingCurrencies = false;
    }

    // Function to update user info
    function updateUserInfo(currentUser: User | null) {
        user = currentUser;
        if (user) {
            username = user.displayName || 'User';
            email = user.email || 'No Email';
            photoURL = user.photoURL || '/favicon.svg';
            
            // Initialize form fields
            newUsername = username;
            newEmail = email;
            
            // Load user preferences from Firestore
            loadUserPreferences();
        } else {
            username = 'User';
            email = 'No Email';
            photoURL = '/favicon.svg';
        }
    }

    // Load user preferences from Firestore
    async function loadUserPreferences() {
        if (!user) return;
        
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                currency = userData.currency || 'INR';
                newCurrency = currency;
                userId = userData.userId || '';
                customUserId = userId;
                
                // Check if user already has a user ID set (not the Firebase UID fallback)
                hasExistingUserId = !!userData.userId && userData.userId !== user.uid;
                
                // Show popup if no user ID is set
                if (!hasExistingUserId) {
                    showUserIdPopup = true;
                    popupUserId = generateSuggestedId();
                }
            } else {
                // First-time user - show popup to set user ID
                showUserIdPopup = true;
                popupUserId = generateSuggestedId();
                hasExistingUserId = false;
            }
        } catch (error) {
            console.error('Error loading user preferences:', error);
            // Show popup on error as well
            showUserIdPopup = true;
            popupUserId = generateSuggestedId();
        }
    }

    // Setup user profile with User ID
    async function setupUserProfile() {
        if (!user || !popupUserId.trim()) return;
        
        isSettingUpUserId = true;
        popupError = '';

        try {
            // Validate user ID
            const validation = await validateUserId(popupUserId);
            if (!validation.valid) {
                popupError = validation.message;
                isSettingUpUserId = false;
                return;
            }

            // Create user profile with the chosen User ID
            await setDoc(doc(db, 'users', user.uid), {
                userId: popupUserId,
                displayName: user.displayName || 'User',
                email: user.email,
                currency: 'INR',
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            // Reserve the user ID
            await setDoc(doc(db, 'userIds', popupUserId.toLowerCase()), {
                uid: user.uid,
                createdAt: new Date()
            });
            
            // Update local state
            userId = popupUserId;
            customUserId = popupUserId;
            currency = 'INR';
            newCurrency = 'INR';
            hasExistingUserId = true;
            showUserIdPopup = false;
            
            successMessage = 'Profile setup completed successfully!';
            
        } catch (error: any) {
            console.error('Error setting up user profile:', error);
            popupError = error.message || 'Failed to setup profile. Please try again.';
        } finally {
            isSettingUpUserId = false;
        }
    }

    // Save user profile changes
    async function saveProfile(e: Event) {
        e.preventDefault();
        if (!user) return;
        
        isSubmitting = true;
        errorMessage = '';
        successMessage = '';

        try {
            const updates: any = {
                displayName: newUsername,
                currency: newCurrency,
                updatedAt: new Date()
            };

            // Update user profile in Firestore
            await updateDoc(doc(db, 'users', user.uid), updates);

            // Update local state
            username = newUsername;
            currency = newCurrency;
            
            if (newEmail !== email) {
                email = newEmail;
            }

            successMessage = 'Profile updated successfully!';
            isEditing = false;
        } catch (error: any) {
            console.error('Error updating profile:', error);
            
            // Handle specific Firestore errors
            if (error.code === 'permission-denied') {
                errorMessage = 'Permission denied. You can only update your own profile.';
            } else if (error.code === 'not-found') {
                errorMessage = 'User profile not found. Please refresh and try again.';
            } else {
                errorMessage = error.message || 'Failed to update profile. Please try again.';
            }
        } finally {
            isSubmitting = false;
        }
    }

    // Cancel editing
    function cancelEdit() {
        newUsername = username;
        newEmail = email;
        newCurrency = currency;
        customUserId = userId;
        isEditing = false;
        errorMessage = '';
        successMessage = '';
    }

    // Format currency code for display
    function formatCurrencyCode(code: string): string {
        return code.toUpperCase();
    }

    // Generate a suggested user ID
    function generateSuggestedId(): string {
        const base = username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        return base ? `${base}_${randomSuffix}` : `user_${randomSuffix}`;
    }

    // Generate new suggestion for popup
    function generateNewSuggestion() {
        popupUserId = generateSuggestedId();
    }

    onMount(() => {
        // Check initial screen size
        checkScreenSize();
        window.addEventListener('resize', checkScreenSize);

        // Set initial state
        const currentUser = getAuth(app).currentUser;
        updateUserInfo(currentUser);
        
        // Fetch available currencies
        fetchCurrencies();

        // Listen for auth state changes
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
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
	<title>Profile - Kash</title>
</svelte:head>

<!-- User ID Setup Popup -->
{#if showUserIdPopup}
<div class="modal is-active">
    <div class="modal-background"></div>
    <div class="modal-card">
        <header class="modal-card-head has-background-black">
            <p class="modal-card-title has-text-white">Complete Your Profile Setup</p>
        </header>
        <section class="modal-card-body has-background-grey-darker">
            <div class="content has-text-white">
                <p>Welcome to <strong>Kash</strong>! 🎉</p>
                <p>To get started, you need to set up your unique User ID. This will be your permanent identifier in the system.</p>
                
                {#if popupError}
                    <div class="notification is-danger">
                        {popupError}
                    </div>
                {/if}

                <div class="field">
                    <label class="label has-text-white">Choose Your User ID</label>
                    <div class="control">
                        <input
                            class="input"
                            type="text"
                            placeholder="Enter unique user ID"
                            bind:value={popupUserId}
                            maxlength="20"
                            disabled={isSettingUpUserId}
                        />
                    </div>
                    <p class="help has-text-grey-light">
                        3-20 characters, letters, numbers, underscores, and hyphens only.
                        <button type="button" class="button is-small is-text has-text-info" on:click={generateNewSuggestion} disabled={isSettingUpUserId}>
                            Suggest New ID
                        </button>
                    </p>
                </div>

                <div class="notification is-warning is-light">
                    <div class="content">
                        <p class="has-text-weight-semibold">Important:</p>
                        <ul>
                            <li>This User ID is <strong>permanent</strong> and cannot be changed later</li>
                            <li>It will be used to identify you across the platform</li>
                            <li>Choose something memorable and unique</li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>
        <footer class="modal-card-foot has-background-black">
            <button
                class="button is-warning {isSettingUpUserId ? 'is-loading' : ''}"
                on:click={setupUserProfile}
                disabled={isSettingUpUserId || !popupUserId.trim()}
            >
                Complete Setup
            </button>
        </footer>
    </div>
</div>
{/if}

<!-- Main Profile Content (Hidden during setup) -->
{#if !showUserIdPopup}
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
                                <h1 class="title is-4 has-text-white mb-0">Profile</h1>
                            </div>
                            <div class="level-right">
                                <button class="button is-warning is-small" on:click={() => {
                                    isEditing = !isEditing;
                                    if (isEditing && Object.keys(currencies).length === 0) {
                                        fetchCurrencies();
                                    }
                                }}>
                                    {#if isEditing}
                                        Cancel
                                    {:else}
                                        Edit
                                    {/if}
                                </button>
                            </div>
                        </div>
                    </div>
                {/if}

				<div class="welcome-section">
					<div class="profile-container {isMobile ? 'mobile-padding' : 'desktop-padding'}">
						<div class="profile-media media">
							<div class="media-left">
								<figure class="image {isMobile ? 'is-48x48' : 'is-64x64'}">
									<img class="profile-pic is-rounded" src={photoURL} alt="Profile" />
								</figure>
							</div>
							<div class="media-content">
                                {#if isMobile}
                                    <p class="welcome-title title is-4 has-text-white">Welcome back! 👋</p>
                                    <p class="welcome-subtitle subtitle is-6 has-text-white">{username}</p>
                                    <p class="welcome-currency subtitle is-7 has-text-grey-light">
                                        ID: <strong>{userId}</strong> • {formatCurrencyCode(currency)}
                                    </p>
                                {:else}
                                    <p class="welcome-title title is-3 has-text-white">Welcome back, <span class="username-highlight">{username}</span>! 👋</p>
                                    <p class="welcome-subtitle subtitle is-6 has-text-white">{email}</p>
                                    <p class="welcome-currency subtitle is-7 has-text-grey-light">
                                        User ID: <strong>{userId}</strong> • Currency: {formatCurrencyCode(currency)} 
                                        {#if currencies[currency.toLowerCase()]}
                                            - {currencies[currency.toLowerCase()]}
                                        {/if}
                                        {#if hasExistingUserId}
                                            <br><span class="has-text-orange">User ID is permanent and cannot be changed</span>
                                        {/if}
                                    </p>
                                {/if}
							</div>
                            {#if !isMobile}
                                <div class="media-right">
                                    <button class="button is-warning is-outlined" on:click={() => {
                                        isEditing = !isEditing;
                                        if (isEditing && Object.keys(currencies).length === 0) {
                                            fetchCurrencies();
                                        }
                                    }}>
                                        {#if isEditing}
                                            Cancel Edit
                                        {:else}
                                            Edit Profile
                                        {/if}
                                    </button>
                                </div>
                            {/if}
						</div>
					</div>

					<!-- Profile Edit Form -->
					{#if isEditing}
						<div class="profile-form-container {isMobile ? 'mobile-padding' : 'desktop-padding'}">
							<div class="box has-background-black">
                                {#if !isMobile}
                                    <h2 class="title is-4 has-text-white mb-4">Edit Profile</h2>
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
										<button class="delete" on:click={() => errorMessage = ''}></button>
										{errorMessage}
									</div>
								{/if}

								<form on:submit={saveProfile}>
									<div class="columns {isMobile ? 'is-multiline' : ''}">
										<div class="column {isMobile ? 'is-12' : 'is-6'}">
											<div class="field">
												<label class="label has-text-white {isMobile ? 'is-size-7' : ''}">Display Name</label>
												<div class="control">
													<input
														class="input {isMobile ? 'is-small' : ''}"
														type="text"
														placeholder="Enter your display name"
														bind:value={newUsername}
														required
													/>
												</div>
											</div>

											<div class="field">
												<label class="label has-text-white {isMobile ? 'is-size-7' : ''}">
													User ID
													{#if hasExistingUserId}
														<span class="tag is-warning ml-2 {isMobile ? 'is-small' : ''}">Permanent</span>
													{/if}
												</label>
												<div class="control">
													<input
														class="input {isMobile ? 'is-small' : ''} is-static"
														type="text"
														value={userId}
														readonly
														title="User ID cannot be changed once set"
													/>
												</div>
												<p class="help has-text-grey-light {isMobile ? 'is-size-7' : ''}">
													<span class="has-text-orange">User ID is permanent and cannot be changed once set.</span>
												</p>
											</div>

											<div class="field">
												<label class="label has-text-white {isMobile ? 'is-size-7' : ''}">Email Address</label>
												<div class="control">
													<input
														class="input {isMobile ? 'is-small' : ''}"
														type="email"
														placeholder="Enter your email"
														bind:value={newEmail}
														required
														disabled={true}
													/>
												</div>
												<p class="help has-text-grey-light {isMobile ? 'is-size-7' : ''}">
													Email changes require verification. Contact support for assistance.
												</p>
											</div>
										</div>

										<div class="column {isMobile ? 'is-12' : 'is-6'}">
											<div class="field">
												<label class="label has-text-white {isMobile ? 'is-size-7' : ''}">Preferred Currency</label>
												<div class="control">
													<div class="select {isMobile ? 'is-small is-fullwidth' : 'is-fullwidth'}">
														<select bind:value={newCurrency} disabled={isLoadingCurrencies}>
															{#if isLoadingCurrencies}
																<option value={currency}>Loading currencies...</option>
															{:else}
																{#if currencyError}
																	<option value={currency}>{currencyError}</option>
																{/if}
																
																{#if Object.keys(currencies).length > 0}
																	{#each Object.entries(currencies) as [code, name]}
																		<option value={code.toUpperCase()} selected={code.toUpperCase() === newCurrency}>
																			{code.toUpperCase()} - {name}
																		</option>
																	{/each}
																{:else}
																	<option value="USD">USD - United States Dollar</option>
																	<option value="EUR">EUR - Euro</option>
																	<option value="GBP">GBP - British Pound</option>
																	<option value="JPY">JPY - Japanese Yen</option>
																	<option value="INR">INR - Indian Rupee</option>
																	<option value="BTC">BTC - Bitcoin</option>
																	<option value="ETH">ETH - Ethereum</option>
																{/if}
															{/if}
														</select>
													</div>
												</div>
												<p class="help has-text-grey-light {isMobile ? 'is-size-7' : ''}">
													This will be used for all financial calculations and displays.
													{#if Object.keys(currencies).length > 0 && !isMobile}
														<br>200+ currencies supported including cryptocurrencies.
													{/if}
												</p>
											</div>

											<div class="field">
												<label class="label has-text-white {isMobile ? 'is-size-7' : ''}">Profile Photo</label>
												<div class="control">
													<div class="file has-name is-fullwidth {isMobile ? 'is-small' : ''}">
														<label class="file-label">
															<input class="file-input" type="file" accept="image/*" />
															<span class="file-cta">
																<span class="file-icon">📷</span>
																<span class="file-label">Choose photo…</span>
															</span>
															<span class="file-name">No file chosen</span>
														</label>
													</div>
												</div>
												<p class="help has-text-grey-light {isMobile ? 'is-size-7' : ''}">
													Profile photo changes coming soon.
												</p>
											</div>
										</div>
									</div>

									<div class="field is-grouped {isMobile ? 'is-grouped-centered' : 'is-grouped-right'}">
										<div class="control">
											<button
												class="button {isMobile ? 'is-small' : ''} is-light"
												type="button"
												on:click={cancelEdit}
												disabled={isSubmitting}
											>
												Cancel
											</button>
										</div>
										<div class="control">
											<button
												class="button {isMobile ? 'is-small' : ''} is-warning {isSubmitting ? 'is-loading' : ''}"
												type="submit"
												disabled={isSubmitting || isLoadingCurrencies}
											>
												Save Changes
											</button>
										</div>
									</div>
								</form>
							</div>
						</div>
					{/if}
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

                            <div class="bottom-nav-item active">
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

	.welcome-section {
		padding: 0;
	}
	
	.profile-container {
		overflow: hidden;
		background: #1a1a1a;
		position: relative;
		border-bottom: 1px solid #333;
		margin-bottom: 0;
	}

	.profile-container.desktop-padding {
		padding: 2rem;
	}

	.profile-container.mobile-padding {
		padding: 1rem;
	}
	
	.profile-pic {
		border: 3px solid #ff3e00;
		padding: 2px;
		background: #000000;
		transition: all 0.3s ease;
	}
	
	.profile-pic:hover {
		border-color: #ff6a33;
		transform: scale(1.05);
	}
	
	.welcome-title {
		margin: 0 0 0.5rem 0;
		line-height: 1.2;
		color: #ffffff;
	}
	
	.username-highlight {
		color: #ff6a33;
		background: linear-gradient(135deg, #ff3e00, #ff6a33);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}
	
	.welcome-subtitle {
		margin: 0 0 0.25rem 0;
		color: #ffffff !important;
		opacity: 0.8;
	}
	
	.welcome-currency {
		margin: 0;
		color: #888 !important;
		font-size: 0.8rem;
	}
	
	.profile-form-container {
		background: #1a1a1a;
	}

	.profile-form-container.desktop-padding {
		padding: 2rem;
	}

	.profile-form-container.mobile-padding {
		padding: 1rem;
	}
	
	.has-text-orange {
		color: #ff6a33 !important;
	}

	/* Modal styles */
	:global(.modal-card) {
		width: 90%;
		max-width: 500px;
	}

	:global(.modal-card-head) {
		border-bottom: 1px solid #333;
	}

	:global(.modal-card-foot) {
		border-top: 1px solid #333;
	}

	:global(.notification.is-warning.is-light) {
		background-color: rgba(255, 62, 0, 0.1) !important;
		border: 1px solid #ff3e00;
		color: #ff6a33 !important;
	}
	
	/* Form styling to match your existing design */
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
	
	:global(.input::placeholder) {
		color: #888 !important;
	}
	
	:global(.input.is-static) {
		background-color: #444 !important;
		border-color: #555 !important;
		color: #888 !important;
		cursor: not-allowed;
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
	
	:global(.button.is-warning:hover) {
		background-color: #ff6a33;
		border-color: #ff6a33;
		color: white;
	}
	
	:global(.file-name) {
		background-color: #333 !important;
		border-color: #444 !important;
		color: white !important;
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
		.profile-media {
			flex-direction: column;
			text-align: center;
		}
		
		.media-left {
			margin-right: 0 !important;
			margin-bottom: 1rem;
		}
		
		.media-right {
			margin-top: 1rem;
		}

		:global(.modal-card) {
			width: 95%;
			margin: 0 auto;
		}

		.bottom-nav-label {
			font-size: 0.65rem;
		}

		.bottom-nav-icon {
			width: 22px;
			height: 22px;
		}

		:global(.title.is-2) {
			font-size: 1.5rem;
		}

		:global(.title.is-3) {
			font-size: 1.25rem;
		}

		:global(.title.is-4) {
			font-size: 1.125rem;
		}

		:global(.title.is-5) {
			font-size: 1rem;
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

		.profile-container.mobile-padding,
		.profile-form-container.mobile-padding {
			padding: 0.75rem;
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

	:global(.has-text-warning) {
		color: #ff3e00 !important;
	}

	:global(.has-text-success) {
		color: #51cf66 !important;
	}

	:global(.has-text-danger) {
		color: #ff6b6b !important;
	}
</style>