import { createJsonRpcRequest } from "@cosmjs/tendermint-rpc/build/jsonrpc";
import dotenv from "dotenv";

import { trySomeArb } from "./arbitrage/arbitrage";
import * as Juno from "./juno/juno";
import { getSlackClient, sendSlackMessage } from "./logging/slacklogger";
import { getChainOperator } from "./node/chainoperator";
import { getSkipClient } from "./node/skipclients";
import * as Terra from "./terra/terra";
import { MempoolLoop } from "./types/arbitrage/mempoolLoop";
import { SkipLoop } from "./types/arbitrage/skipLoop";
import { setBotConfig } from "./types/core/botConfig";
import { getPathsFromPool, getPathsFromPools3Hop } from "./types/core/path";
// load env files
dotenv.config();
const botConfig = setBotConfig(process.env);

let getFlashArbMessages = Juno.getFlashArbMessages;
let getPoolStates = Juno.getPoolStates;
let initPools = Juno.initPools;
switch (process.env.CHAIN_PREFIX) {
	case "terra": {
		getFlashArbMessages = Terra.getFlashArbMessages;
		getPoolStates = Terra.getPoolStates;
		initPools = Terra.initPools;
	}
}

console.log("---".repeat(30));
console.log("Environmental variables for setup:");
console.log("RPC ENPDOINT: ", botConfig.rpcUrl);
console.log("OFFER DENOM: ", botConfig.offerAssetInfo);
console.log("POOLS: ", botConfig.poolEnvs);
console.log("FACTORIES_TO_ROUTERS_MAPPING", botConfig.mappingFactoryRouter);
console.log("USE MEMPOOL: ", botConfig.useMempool);
console.log("USE SKIP: ", botConfig.useSkip);
if (botConfig.useSkip) {
	console.log("SKIP URL: ", botConfig.skipRpcUrl);
}
console.log("---".repeat(30));

/**
 * Runs the main program.
 */
async function main() {
	console.log("Setting up connections and paths");
	const [account, botClients] = await getChainOperator(botConfig);
	let slackClient;
	if (botConfig.slackToken) {
		slackClient = getSlackClient(botConfig.slackToken);
	}

	const { accountNumber, sequence } = await botClients.SigningCWClient.getSequence(account.address);
	const chainId = await (
		await botClients.HttpClient.execute(createJsonRpcRequest("block"))
	).result.block.header.chain_id;
	console.log("accountnumber: ", accountNumber, " sequence: ", sequence, "chainid: ", chainId);
	console.log("Done, Clients established");
	console.log("---".repeat(30));
	console.log("Deriving paths for arbitrage");
	const pools = await initPools(botClients.WasmQueryClient, botConfig.poolEnvs, botConfig.mappingFactoryRouter);
	const paths = getPathsFromPool(pools, botConfig.offerAssetInfo);
