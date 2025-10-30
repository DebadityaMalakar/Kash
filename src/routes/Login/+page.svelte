<script>
	import { onMount } from 'svelte';
	// @ts-ignore
	import { app, auth } from '$lib/firebase/firebase';
	import { EmailAuthProvider, GoogleAuthProvider, onAuthStateChanged } from '@firebase/auth';
	import 'firebaseui/dist/firebaseui.css';
	import { getCookieValue, setValidationCookie } from '../../utils/cookie';
	onMount(() => {
		if (getCookieValue('accessToken')) {
			window.location.href = '/Dashboard';
		}
		onAuthStateChanged(auth, (user) => {
			setValidationCookie('userLoggedIn', user ? 'true' : 'false');
			// @ts-ignore
			setValidationCookie('accessToken', user ? user.accessToken : '');
		});
		if (typeof window !== 'undefined') {
			import('firebaseui').then((firebaseui) => {
				const ui = new firebaseui.auth.AuthUI(auth);
				ui.start('#firebase-auth-container', {
					signInFlow: 'popup',
					signInOptions: [EmailAuthProvider.PROVIDER_ID, GoogleAuthProvider.PROVIDER_ID],
					signInSuccessUrl: '/Dashboard'
				});
			});
		}
	});
</script>

<section>
	<div id="firebase-auth-container"></div>
</section>
