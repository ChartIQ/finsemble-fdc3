declare global {
	interface Window {
		FSBL: typeof FSBL;
	}
}

const win = window as Window;
export default class C implements Channel {
	id: string;
	type: string;
	displayMetadata?: DisplayMetadata;
	#FSBL: any;
	constructor(params: any) {
		this.id = params.id;
		this.type = params.type;
		this.displayMetadata = params.displayMetadata;
		this.#FSBL = win.FSBL || params.FSBL;
	}

	broadcast(context: object): void {
		this.#FSBL.Clients.RouterClient.query(
			"FDC3.Channel.broadcast",
			{
				source: this.#FSBL.Clients.WindowClient.getWindowIdentifier().windowName, //used to prevent message loops
				channel: this.id,
				context,
			},
			() => {}
		);
	}

	async getCurrentContext(contextType?: string): Promise<object> {
		const { err, response } = await this.#FSBL.Clients.RouterClient.query(
			"FDC3.Channel.getCurrentContext",
			{
				channel: this.id,
				contextType,
			},
			() => {}
		);
		if (err) {
			throw err;
		} else {
			return response.data;
		}
	}

	addContextListener(handler: ContextHandler): Listener;
	addContextListener(contextType: string, handler: ContextHandler): Listener;
	addContextListener(contextTypeOrHandler: string | ContextHandler, handler?: ContextHandler): Listener {
		let theHandler: ContextHandler | undefined = undefined;
		let theListenerName: string | undefined = undefined;
		const currentWindowName = this.#FSBL.Clients.WindowClient.getWindowIdentifier().windowName;

		//disambiguate arguments
		if (typeof contextTypeOrHandler === "string") {
			theHandler = handler;
			theListenerName = `FDC3.broadcast.${contextTypeOrHandler}`;
		} else {
			theHandler = contextTypeOrHandler;
			theListenerName = `FDC3.broadcast`;
		}

		//only send the context data on if it did not get broadcast from this window
		const messageLoopPrevention = (
			_arg1: string | Error | null,
			response: { data: { source: string; channel: string; context: object } }
		) => response.data.source !== currentWindowName && channelFilter(response.data);

		const channelFilter = (data: { source: string; channel: string; context: object }) =>
			this.id == data.channel && theHandler && theHandler(data.context);

		this.#FSBL.Clients.RouterClient.addListener(theListenerName, messageLoopPrevention);

		return {
			unsubscribe: () => {
				this.#FSBL.Clients.RouterClient.removeListener(theListenerName, messageLoopPrevention);
			},
		};
	}
}
