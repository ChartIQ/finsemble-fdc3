import * as React from "react";

function AddBoxIcon(props: any) {
	return (
		<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
			<path
				d="M21.484 11.125l-9.022-5a1 1 0 00-.968-.001l-8.978 4.96a1 1 0 00-.003 1.749l9.022 5.04a.995.995 0 00.973.001l8.978-5a1 1 0 00-.002-1.749zm-9.461 4.73l-6.964-3.89 6.917-3.822 6.964 3.859-6.917 3.853z"
				fill="#fff"
			/>
			<path
				d="M12 22c.17 0 .337-.043.485-.126l9-5-.971-1.748L12 19.856l-8.515-4.73-.971 1.748 9 5A1 1 0 0012 22zm8-20h-2v2h-2v2h2v2h2V6h2V4h-2V2z"
				fill="#fff"
			/>
		</svg>
	);
}

export default AddBoxIcon;
