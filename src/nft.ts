import {
  Field,
  Struct,
  method,
  PrivateKey,
  SmartContract,
  Mina,
  AccountUpdate,
  Reducer,
  provable,
  PublicKey,
  Bool,
  Poseidon,
  Provable,
  assert,
  state,
  UInt32,
  State,
  DeployArgs,
  Permissions,
  Signature,
} from 'o1js';

class KVState extends Struct({
  isSome: Bool,
  value: Field,
}) {}

class Voucher extends Struct({
  ownerWitness: Field,
  useRandomCode: Field,
  uri: Field,
}) {
  hash() {
    return Poseidon.hash(
      this.uri
        .toFields()
        .concat([this.ownerWitness])
        .concat([this.useRandomCode])
    );
  }

  use(useRandomCode: Field) {
    return new Voucher({
      uri: this.uri,
      ownerWitness: this.ownerWitness,
      useRandomCode: useRandomCode,
    });
  }

  isUse() {
    return this.useRandomCode.equals(Field(0)).equals(Bool(false));
  }
}

const KeyValuePair = provable({
  key: UInt32,
  value: Field,
});

class VoucherContract extends SmartContract {
  reducer = Reducer({
    actionType: KeyValuePair,
  });

  @state(UInt32) totalSupply = State<UInt32>();
  @state(UInt32) currentIdx = State<UInt32>();
  @state(PublicKey) merchantPubKey = State<PublicKey>();

  deploy(args?: DeployArgs) {
    super.deploy(args);

    this.account.permissions.set({
      ...Permissions.default(),
      access: Permissions.proofOrSignature(),
    });
  }

  onlyOwner() {
    this.merchantPubKey.getAndRequireEquals().assertEquals(this.sender);
  }

  @method initState(merchantPubKey: PublicKey, totalSupply: UInt32) {
    this.merchantPubKey.set(merchantPubKey);
    this.totalSupply.set(totalSupply);
  }

  @method
  async mint(voucher: Voucher) {
    this.onlyOwner();

    //get current index
    let currentIdx = this.currentIdx.get();
    this.currentIdx.requireEquals(currentIdx);

    //check index <= totalSupply
    this.totalSupply.getAndRequireEquals().assertGreaterThanOrEqual(currentIdx);

    //voucher must set useRandomCode = 0
    voucher.useRandomCode.assertEquals(Field(0));

    this.reducer.dispatch({
      key: currentIdx,
      value: voucher.hash(),
    });

    this.currentIdx.set(currentIdx.add(1));
    this.reducer.dispatch({ key: currentIdx, value: voucher.hash() });

    return true;
  }

  @method
  async use(
    key: UInt32,
    voucher: Voucher,
    useRandomCode: Field,
    ownerSignature: Signature
  ) {
    // key.assertLessThanOrEqual(this.totalSupply.get());
    voucher.isUse().assertEquals(Bool(false));
    voucher.ownerWitness.assertEquals(Poseidon.hash(ownerSignature.toFields()));

    let voucherHash = voucher.hash();

    let pendingActions = this.reducer.getActions({
      fromActionState: Reducer.initialActionState,
    });

    let { state } = this.reducer.reduce(
      pendingActions,
      KVState,
      (state, action) => {
        let currentMatchKey = key.equals(action.key);

        return {
          isSome: currentMatchKey,
          value: Provable.if(currentMatchKey, action.value, state.value),
        };
      },
      {
        state: KVState.empty(),
        actionState: Reducer.initialActionState,
      }
    );

    // state.isSome.assertEquals(Bool(true));
    state.value.assertEquals(voucherHash);

    const usedVoucher = voucher.use(useRandomCode);
    this.reducer.dispatch({ key, value: usedVoucher.hash() });

    this.reducer.dispatch({
      key: key,
      value: usedVoucher.hash(),
    });

    return true;
  }
}

export { Voucher, VoucherContract };
