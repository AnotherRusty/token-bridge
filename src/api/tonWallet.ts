import BN from "bn.js";
import TonWeb from "tonweb";
import { Address } from "tonweb/dist/types/utils/address";

async function burnJetton({
  tonwebWallet,
  destinationAddress,
  userTonAddress,
  jettonWalletAddress,
  jettonAmountWithDecimals,
}: {
  tonwebWallet: any;
  destinationAddress: BN;
  userTonAddress: Address;
  jettonWalletAddress: Address | null;
  jettonAmountWithDecimals: BN;
}) {
  if (!jettonWalletAddress) return;
  const burnOP = 0x595f07bc; // burn op
  const queryId = new TonWeb.utils.BN(0);

  const burnPayload = new TonWeb.boc.Cell();
  burnPayload.bits.writeUint(burnOP, 32);
  const customPayload = new TonWeb.boc.Cell();
  customPayload.bits.writeUint(destinationAddress, 160);

  burnPayload.refs.push(customPayload);

  burnPayload.bits.writeUint(queryId, 64);
  burnPayload.bits.writeCoins(jettonAmountWithDecimals);
  burnPayload.bits.writeAddress(userTonAddress);

  await tonwebWallet.provider.send("ton_sendTransaction", [
    {
      to: jettonWalletAddress?.toString(true, true, true),
      value: TonWeb.utils.toNano("1").toString(),
      data: TonWeb.utils.bytesToBase64(await burnPayload.toBoc()),
      dataType: "boc",
    },
  ]);
}

export { burnJetton };