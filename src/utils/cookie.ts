// Set a cookie that expires in 3 months
function setValidationCookie(name: any, value: any) {
	const now = new Date();
	const threeMonthsFromNow = new Date(now.setMonth(now.getMonth() + 3));
	document.cookie = `${name}=${value}; expires=${threeMonthsFromNow.toUTCString()}; path=/`;
}
function getCookieValue(name: string) {
	const cookies = document.cookie.split(';');
	for (let cookie of cookies) {
		const [key, val] = cookie.trim().split('=');
		if (key === name) return val;
	}
	return null;
}

export { setValidationCookie, getCookieValue };
