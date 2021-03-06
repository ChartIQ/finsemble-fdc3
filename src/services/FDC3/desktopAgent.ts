import Channel from "./channel";
// import * as standardIntents from './intents/standard intents.json'

interface AppIntentContexts {
	app: AppMetadata;
	intent: IntentMetadata;
	contexts: Array<string>;
}

// https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
const hashFnv32a = (str: string, asString: boolean, seed?: number) => {
	/*jshint bitwise:false */
	let i,
		l,
		hval = seed === undefined ? 0x811c9dc5 : seed;

	for (i = 0, l = str.length; i < l; i++) {
		hval ^= str.charCodeAt(i);
		hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
	}
	if (asString) {
		// Convert to 8 digit hex string
		return ("0000000" + Math.abs(hval >>> 0).toString(16)).substr(-6);
	}
	return hval >>> 0;
};

export default class D implements DesktopAgent {
	FSBL: typeof FSBL;
	LauncherClient: any; //typeof LauncherClient;
	LinkerClient: any; //typeof LinkerClient;
	RouterClient: any;
	DialogManager: typeof FSBL.Clients.DialogManager;
	systemChannels: Array<Channel> = [];
	customChannels: Array<Channel> = [];
	appIntents: { [key: string]: AppIntent } = {};
	appIntentsContext: { [key: string]: { [key: string]: AppIntent } } = {};
	apps: { [key: string]: AppMetadata } = {};
	windowName = "";
	globalChannel: Channel;

	constructor(params: any) {
		this.FSBL = params.FSBL;
		this.LinkerClient = this.FSBL.Clients.LinkerClient;
		this.LauncherClient = this.FSBL.Clients.LauncherClient;
		this.RouterClient = this.FSBL.Clients.RouterClient;
		this.DialogManager = this.FSBL.Clients.DialogManager;
		this.globalChannel = new Channel({
			id: "global",
			type: "system",
			displayMetadata: {
				name: "global",
			},
			FSBL: this.FSBL,
		});

		// Make sure all existing Linker Channels get added to systemChannels. Any new channels created later will not.
		this.getSystemChannels();
		this.setupApps();
	}

	private setupApps() {
		this.RouterClient.subscribe("Launcher.update", (err: any, response: any) => {
			if (err) throw Error(err);

			this.appIntents = {};
			this.apps = {};

			const components: { component: any; foreign: any }[] = Object.values(response.data.componentList);

			for (const componentConfig of components) {
				// const component: any = c; // putting component:any in the loop itself results in it being unknown instead of any.
				const { component, foreign } = componentConfig;
				try {
					// component needs to have a name
					if (!component?.type) throw Error("Component does not have a type");

					const appMetadata: AppMetadata = {
						name: component?.type,
						title: component?.displayName,
						tooltip: component?.displayName,
						icons: [foreign?.components?.Toolbar?.iconURL],
					};
					this.apps[appMetadata.name] = appMetadata;

					const intents = foreign?.services?.fdc3?.intents;
					if (intents && intents.length) {
						for (const intentConfig of intents) {
							const intent: IntentMetadata = {
								name: intentConfig.name,
								displayName: intentConfig.displayName,
							};

							// add the intent if it does not exist then push the metadata to it
							if (!this.appIntents[intent.name]) {
								this.appIntents[intent.name] = {
									intent,
									apps: [],
								};
								this.appIntents[intent.name].apps.push(appMetadata);
							} else {
								//don't add duplicates, replace instead
								const idx = this.appIntents[intent.name].apps.findIndex((app) => app.name == appMetadata.name);
								if (idx == -1) {
									this.appIntents[intent.name].apps.push(appMetadata);
								} else {
									this.appIntents[intent.name].apps[idx] = appMetadata;
								}
							}

							const contexts = intentConfig.contexts;
							if (contexts && contexts.length) {
								for (const context of contexts) {
									if (!this.appIntentsContext[context]) {
										this.appIntentsContext[context] = {};
									}

									if (!this.appIntentsContext[context][intent.name]) {
										this.appIntentsContext[context][intent.name] = {
											intent,
											apps: [],
										};
										this.appIntentsContext[context][intent.name].apps.push(appMetadata);
									} else {
										//don't add duplicates, replace instead
										const idx = this.appIntentsContext[context][intent.name].apps.findIndex(
											(app) => app.name == appMetadata.name
										);
										if (idx == -1) {
											this.appIntentsContext[context][intent.name].apps.push(appMetadata);
										} else {
											this.appIntentsContext[context][intent.name].apps[idx] = appMetadata;
										}
									}
								}
							}
						}
					}
				} catch (err) {
					this.FSBL.Clients.Logger.error("setupAppsError: " + err);
				}
			}
			console.log(this.apps);
			console.log(this.appIntents);
			console.log(this.appIntentsContext);
		});
	}

	/** ___________Context ___________ */
	getCurrentChannel(): Promise<Channel> {
		throw new Error("Method not implemented in Service. Use Client.");
	}

	/** ___________Apps ___________ */
	async open(name: string, context?: object) {
		throw new Error("Method not implemented in Service. Use Client.");
	}

	/** ___________Context ___________ */
	broadcast(context: any): void {
		throw new Error("Method not implemented in Service. Use Client.");
	}

	addContextListener(handler: ContextHandler): Listener;
	addContextListener(contextType: string, handler: ContextHandler): Listener;
	addContextListener(contextType: string | ContextHandler, handler?: ContextHandler): Listener {
		throw new Error("Method not implemented in Service. Use Client.");
	}

	/** ___________Intents ___________ */

	async findIntent(intent: string, context?: Context): Promise<AppIntent> {
		let appIntent: AppIntent | undefined = undefined;
		if (context) {
			const contextType = context.type;
			if (this.appIntentsContext[contextType]) {
				appIntent = this.appIntentsContext[contextType][intent];
			}
		} else {
			appIntent = this.appIntents[intent];
		}
		if (appIntent) return appIntent;
		throw new Error(ResolveError.NoAppsFound);
	}

	async findIntentsByContext(context: Context): Promise<Array<AppIntent>> {
		const intents = this.appIntentsContext[context.type];
		if (intents) {
			return Object.values(intents);
		}
		throw new Error(ResolveError.NoAppsFound);
	}

	async raiseIntent(intent: string, context: Context, target?: string): Promise<IntentResolution> {
		const appIntent = await this.findIntent(intent, context);
		if (!appIntent) {
			throw new Error(ResolveError.ResolverUnavailable);
		}

		return new Promise((resolve, reject) => {
			const dialogParams = {
				appIntent,
				context,
				target: target || null,
				source: this.windowName,
			};
			// Launch intent resolver component
			this.DialogManager.open("intentResolverModal", dialogParams, (err: any, data: any) => {
				if (err) {
					reject("Intent could not be resolved");
				}
				if (data) {
					if (!data?.success) {
						reject("Intent could not be resolved");
					}
					if (data?.success) {
						const intentResolution: IntentResolution = {
							source: data.source,
							data,
							version: "1.1",
						};
						resolve(intentResolution);
					}
				}
			});
		});
	}

	addIntentListener(intent: string, handler: ContextHandler): Listener {
		throw new Error("Method not implemented.");
	}

	/** ___________Channels ___________ */

	async getOrCreateChannel(channelId: string): Promise<Channel> {
		const channel = this.findChannel(channelId);
		if (channel) {
			return channel;
		} else {
			return await this.createCustomChannel(channelId);
		}
	}

	async getSystemChannels(): Promise<Array<Channel>> {
		if (this.systemChannels.length) return this.systemChannels;
		const finsembleLinkerChannels = this.LinkerClient.getAllChannels();
		const channels: Array<Channel> = [this.globalChannel];

		for (const finsembleLinkerChannel of finsembleLinkerChannels) {
			const channel = new Channel({
				id: finsembleLinkerChannel.name,
				type: "system",
				displayMetadata: {
					name: finsembleLinkerChannel.name,
					color: finsembleLinkerChannel.color,
					glyph: finsembleLinkerChannel.glyph,
				},
				FSBL: this.FSBL,
			});
			channels.push(channel);
		}

		this.systemChannels = channels;
		return channels;
	}

	private findChannel(channelId: string): Channel | null {
		const systemChannel = this.systemChannels.find((channel) => channel.id === channelId);
		if (systemChannel) {
			return systemChannel;
		}

		const customChannel = this.customChannels.find((channel) => channel.id === channelId);
		if (customChannel) {
			return customChannel;
		}

		return null;
	}

	async joinChannel(channelId: string): Promise<void> {
		throw new Error("Only Implemented in the Client");
	}

	private wait(time: number) {
		return new Promise((resolve) => setTimeout(resolve, time));
	}

	private async createCustomChannel(channelId: string): Promise<Channel> {
		const existingChannel = this.findChannel(channelId);
		if (existingChannel) {
			throw new Error(`Channel ${channelId} already exists`);
		}

		const channelColor = "#" + hashFnv32a(channelId, true); // generate a color
		this.LinkerClient.createChannel(
			{
				name: channelId,
				color: channelColor,
			},
			() => {}
		);
		const channel = new Channel({
			id: channelId,
			type: "app",
			displayMetadata: {
				name: channelId,
				color: channelColor,
				glyph: null,
			},
			FSBL: this.FSBL,
		});

		// There is a bug in the LinkerClient.createChannel that causes it to callback before the channel is created. Just wait so we don't have timing problems
		await this.wait(100);

		return channel;
	}

	leaveCurrentChannel(): Promise<void> {
		throw new Error("Method not implemented in Service. Use Client.");
	}
}
