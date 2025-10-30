<script>
	import Hero from '../sections/Hero.svelte';
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Svelte demo app" />
</svelte:head>

<section>
	<Hero />
	<section class="section has-background-black">
		<div class="container">
			<h2 class="title is-2 has-text-white has-text-centered mb-6">
				Why <span class="has-text-warning">Kash</span> Beats Traditional Budgeting
			</h2>

			<div class="columns is-multiline">
				<div class="column is-3">
					<div class="card has-background-grey-darker">
						<div class="card-content">
							<div class="icon is-large has-text-warning mb-4">🤖</div>
							<h3 class="title is-4 has-text-white">AI Predictions</h3>
							<p class="has-text-grey-light">
								XGBOOST-powered forecasts prevent overspending before it happens
							</p>
						</div>
					</div>
				</div>

				<div class="column is-3">
					<div class="card has-background-grey-darker">
						<div class="card-content">
							<div class="icon is-large has-text-warning mb-4">🛡️</div>
							<h3 class="title is-4 has-text-white">Overhead Protection</h3>
							<p class="has-text-grey-light">
								Extra savings buffer keeps your budget safe from surprises
							</p>
						</div>
					</div>
				</div>

				<div class="column is-3">
					<div class="card has-background-grey-darker">
						<div class="card-content">
							<div class="icon is-large has-text-warning mb-4">📊</div>
							<h3 class="title is-4 has-text-white">Real-time Tracking</h3>
							<p class="has-text-grey-light">
								Watch your budget update instantly with every transaction
							</p>
						</div>
					</div>
				</div>

				<div class="column is-3">
					<div class="card has-background-grey-darker">
						<div class="card-content">
							<div class="icon is-large has-text-warning mb-4">📁</div>
							<h3 class="title is-4 has-text-white">Easy Import</h3>
							<p class="has-text-grey-light">Import from CSV, Excel, or JSON in seconds</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>
	<section class="section has-background-dark">
		<div class="container">
			<h2 class="title is-2 has-text-white has-text-centered mb-6">
				How <span class="has-text-warning">Kash</span> Works
			</h2>

			<div class="columns is-vcentered">
				<div class="column has-text-centered">
					<div class="step-circle has-background-warning mb-4">1</div>
					<h3 class="title is-4 has-text-white">Set Your Budget</h3>
					<p class="has-text-grey-light">Define limits with overhead protection</p>
				</div>

				<div class="column has-text-centered">
					<div class="step-circle has-background-warning mb-4">2</div>
					<h3 class="title is-4 has-text-white">Track & Import</h3>
					<p class="has-text-grey-light">Add transactions or import existing data</p>
				</div>

				<div class="column has-text-centered">
					<div class="step-circle has-background-warning mb-4">3</div>
					<h3 class="title is-4 has-text-white">Get Smart Insights</h3>
					<p class="has-text-grey-light">AI predicts and warns before overspending</p>
				</div>
			</div>
		</div>
	</section>
	<section class="section has-background-black">
		<div class="container has-text-centered">
			<h2 class="title is-2 has-text-white mb-4">
				Ready to Control Your <span class="has-text-warning">Kash</span>?
			</h2>
			<p class="subtitle is-4 has-text-grey-light mb-6">
				Join thousands already managing their money smarter
			</p>
			<button class="button is-warning is-large">
				<strong>Start Free Today</strong>
			</button>
		</div>
	</section>
</section>

<style>
	.step-circle {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: bold;
		color: white;
	}

	.card {
		transition:
			transform 0.3s ease,
			border-color 0.3s ease;
		border: 1px solid #444;
	}

	.card:hover {
		transform: translateY(-5px);
		border-color: #ff3e00;
	}
</style>
