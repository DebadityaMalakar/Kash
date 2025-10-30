<script>
	import { onMount } from 'svelte';

	onMount(() => {
		// @ts-ignore
		document.getElementById(window.location.href.split('/').pop()).classList.add('is-active');
	});
</script>

<div class="column is-3">
	<aside class="menu">
		<!-- <div class="has-text-centered mb-5">
			<button class="button is-warning is-rounded is-large" style="border-radius:100%;">
				<span class="icon">
					<i class="fas fa-plus"></i>
				</span>
			</button>
			<p class="has-text-grey-light is-size-7 mt-2">Add Spending</p>
		</div> -->

		<p class="menu-label has-text-white">Navigation</p>
		<ul class="menu-list">
			<li>
				<a id="Dashboard" href="/Dashboard" class="nav-element has-text-grey-light">Dashboard</a>
			</li>
			<li><a id="Budgets" href="/Budgets" class="nav-element has-text-grey-light">Budgets</a></li>
			<li>
				<a id="Transactions" href="/Transactions" class="nav-element has-text-grey-light"
					>Transactions</a
				>
			</li>
			<li>
				<a id="Analytics" href="/Analytics" class="nav-element has-text-grey-light">Analytics</a>
			</li>
			<li>
				<a id="Predictions" href="/Predictions" class="nav-element has-text-grey-light"
					>Predictions</a
				>
			</li>
		</ul>

		<p class="menu-label has-text-white mt-5">Settings</p>
		<ul class="menu-list">
			<li><a href="/Profile" class="nav-element has-text-grey-light">Profile</a></li>
			<li><a href="/Notifications" class="nav-element has-text-grey-light">Notifications</a></li>
			<li><a href="/Add-data" class="nav-element has-text-grey-light">Add Data</a></li>
		</ul>
	</aside>
</div>

<style>
	.nav-element {
		padding: 6px;
		margin: 8px;
		width: calc(100%);
	}
</style>
