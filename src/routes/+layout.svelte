<script>
	import { onMount } from 'svelte';
	import '../app.css';
	import 'bulma/css/bulma.min.css';
	/** @type {{children: import('svelte').Snippet}} */
	let { children } = $props();
	onMount(() => {
		if (window) {
			if (window.location.href.includes('/Login')) {
				//@ts-ignore
				document.querySelector('#footer').style.position = 'fixed';
				//@ts-ignore
				document.querySelector('#footer').style.bottom = '0';
				//@ts-ignore
				document.querySelector('#footer').style.width = '100%';
			}
		}
	});
</script>

<div class="app">
	<main>
		{@render children()}
	</main>
	<footer id="footer" class="footer has-background-black has-text-grey-light">
		<div class="content has-text-centered">
			<p>
				<strong class="has-text-white">Kash</strong> - Smart budgeting with AI predictions
			</p>
			<div class="buttons is-centered mt-4">
				<a href="#privacy" class="button is-small is-outlined has-text-grey-light">Privacy</a>
				<a href="#terms" class="button is-small is-outlined has-text-grey-light">Terms</a>
				<a href="#contact" class="button is-small is-outlined has-text-grey-light">Contact</a>
			</div>
		</div>
	</footer>
</div>

<style>
</style>
