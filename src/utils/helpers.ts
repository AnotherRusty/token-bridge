import BN from "bn.js";
import Hash from "eth-lib/lib/hash";
import TonWeb from "tonweb";

import { EthToTon } from "@/components/BridgeProcessor/types";

const OFFCHAIN_CONTENT_PREFIX = 0x01;

function getScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script: HTMLScriptElement = document.createElement("script");
    const prior = document.getElementsByTagName("script")[0];
    script.async = true;

    script.onload = () => {
      script.onload = null;
      script.onerror = null;
      setTimeout(resolve, 0);
    };

    script.onerror = () => {
      script.onload = null;
      script.onerror = null;
      setTimeout(reject, 0);
    };

    script.src = src;
    prior.parentNode!.insertBefore(script, prior);
  });
}

function supportsLocalStorage(): boolean {
  try {
    return "localStorage" in window && window["localStorage"] !== null;
  } catch (e) {
    return false;
  }
}

function parseChainId(chainId: string | number): number {
  if (typeof chainId === "number") {
    return chainId;
  }
  if (typeof chainId === "string") {
    return parseInt(chainId, chainId.toLowerCase().startsWith("0x") ? 16 : 10);
  } else {
    return 0;
  }
}

function getNumber(pair: Array<string>): number {
  return parseInt(pair[1], 16);
}

function getBool(pair: Array<string>): boolean {
  return getNumber(pair) === 1;
}

function decToHex(dec: number): string {
  return "0x" + new TonWeb.utils.BN(dec).toString(16);
}

function parseAddressFromDec(data: any): string {
  return decToHex(data.number.number);
}

const readIntFromBitString = (bs: any, cursor: any, bits: any) => {
  let n = BigInt(0);
  for (let i = 0; i < bits; i++) {
    n *= BigInt(2);
    n += BigInt(bs.get(cursor + i));
  }
  return n;
};

const parseAddress = (cell: any) => {
  let n = readIntFromBitString(cell.bits, 3, 8);
  if (n > BigInt(127)) {
    n = n - BigInt(256);
  }
  const hashPart = readIntFromBitString(cell.bits, 3 + 8, 256);
  if (n.toString(10) + ":" + hashPart.toString(16) === "0:0") return null;
  const s = n.toString(10) + ":" + hashPart.toString(16).padStart(64, "0");
  return new TonWeb.Address(s);
};

const parseUri = (bytes: any) => {
  return new TextDecoder().decode(bytes);
};

const parseOffchainUriCell = (cell: any) => {
  if (cell.bits.array[0] !== OFFCHAIN_CONTENT_PREFIX) {
    throw new Error("no OFFCHAIN_CONTENT_PREFIX");
  }

  let length = 0;
  let c = cell;
  while (c) {
    length += c.bits.array.length;
    c = c.refs[0];
  }

  const bytes = new Uint8Array(length);
  length = 0;
  c = cell;
  while (c) {
    bytes.set(c.bits.array, length);
    length += c.bits.array.length;
    c = c.refs[0];
  }
  return parseUri(bytes.slice(1)); // slice OFFCHAIN_CONTENT_PREFIX
};

function makeAddress(address: string): string {
  if (!address.startsWith("0x")) {
    throw new Error("Invalid address " + address);
  }
  let hex = address.substr(2);
  while (hex.length < 40) {
    hex = "0" + hex;
  }
  return "0x" + hex;
}

function parseEthSignature(data: any) {
  const tuple = data.tuple.elements;
  const publicKey = makeAddress(decToHex(tuple[0].number.number));

  const rsv = tuple[1].tuple.elements;
  const r = decToHex(rsv[0].number.number);
  const s = decToHex(rsv[1].number.number);
  const v = Number(rsv[2].number.number);
  return {
    publicKey,
    r,
    s,
    v,
  };
}

function serializeEthToTon(ethToTon: EthToTon) {
  const bits = new TonWeb.boc.BitString(8 + 256 + 16 + 8 + 256 + 64);
  bits.writeUint(0, 8); // vote op
  bits.writeUint(new BN(ethToTon.transactionHash.substr(2), 16), 256);
  bits.writeInt(ethToTon.logIndex, 16);
  bits.writeUint(ethToTon.to.workchain, 8);
  bits.writeUint(new BN(ethToTon.to.address_hash, 16), 256);
  bits.writeUint(new BN(ethToTon.value), 64);
  return bits.array;
}

function getQueryId(ethToTon: EthToTon): BN {
  const MULTISIG_QUERY_TIMEOUT = 30 * 24 * 60 * 60; // 30 days
  const VERSION = 2;
  const timeout = ethToTon.blockTime + MULTISIG_QUERY_TIMEOUT + VERSION;
  const queryStr =
    ethToTon.blockHash +
    "_" +
    ethToTon.transactionHash +
    "_" +
    String(ethToTon.logIndex);

  // web3@1.3.4 has an error in the algo for computing SHA
  // it doesn't strictly check input string for valid HEX relying only for 0x prefix
  // but the query string is formed that way: 0xBLOCKHASH + '_' + 0xTRANSACTIONHASH + '_' + LOGINDEX
  // the keccak algo splits string to pairs of symbols, and treats them as hex bytes
  // so _0 becames NaN, x7 becames NaN, d_ becames 13 (it only sees first d and skips invalid _)
  // web3@1.6.1 has this error fixed, but for our case this means that we've got different hashes for different web3 versions
  // thats why we are using fixed version of eth-lib@0.1.29, and it's Hash.keccak256 (instead of Web3.utils.sha3)
  // it calcs the same results as web3@1.3.4 so we can update web3 to 1.6.1 without breaking compatibility with hashes computed in the old way
  // btw, it's definitially a very bad idea for hash function to treat input as something other than string,
  // have no idea why they are trying to work with 0x strings in a special way, like they are HEX numbers
  const query_id = Hash.keccak256(queryStr)!.substr(2, 8); // get first 32 bit

  return new BN(timeout).mul(new BN(4294967296)).add(new BN(query_id, 16));
}

export {
  decToHex,
  getBool,
  getNumber,
  getQueryId,
  getScript,
  makeAddress,
  parseAddress,
  parseAddressFromDec,
  parseChainId,
  parseEthSignature,
  parseOffchainUriCell,
  serializeEthToTon,
  supportsLocalStorage,
};