import React, { useContext, useState, Component } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, useTheme } from '@react-navigation/native';
import createHash from 'create-hash';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import Biometric from '../../class/biometrics';

import { BlueButton, BlueSpacing20, BlueText, BlueAutocomplete } from '../../BlueComponents';
import navigationStyle from '../../components/navigationStyle';
import { HDSegwitBech32Wallet } from '../../class';
import loc from '../../loc';
import * as bip39 from 'bip39';
import { BlueStorageContext } from '../../blue_modules/storage-context';
import alert from '../../components/Alert';

const A = require('../../blue_modules/analytics');

const WalletsAddBorderFinalWord = () => {
  const { addWallet, saveToDisk, sleep, wallets } = useContext(BlueStorageContext);
  const { colors } = useTheme();

  const navigation = useNavigation();
  const { walletLabel, seedPhrase, importing, walletID } = useRoute().params;

  const stylesHook = StyleSheet.create({
    root: {
      backgroundColor: colors.elevated,
    },
    textdesc: {
      color: colors.alternativeTextColor,
    },
  });

  const onContinue = async () => {
    if (possibleWords.indexOf(textBoxValue) < 0) return;
    await sleep(100);
    try {
      if (!walletID) {
        const w = new HDSegwitBech32Wallet();
        w.setLabel(walletLabel);

        w.setSecret(seedPhrase.join(' ') + ' ' + textBoxValue);

        addWallet(w);
        await saveToDisk();
        A(A.ENUM.CREATED_WALLET);
      } else {
        const wallet = wallets.find(w => w.getID() === walletID);
        const isBiometricsEnabled = await Biometric.isBiometricUseCapableAndEnabled();

        if (isBiometricsEnabled) {
          if (!(await Biometric.unlockWithBiometrics())) {
            alert(loc.border.memory_error_unlocking);
            return;
          }
        }

        const secret = wallet.getSecret();
        if (secret === seedPhrase.join(' ') + ' ' + textBoxValue) {
          alert(loc.border.memory_success);
        } else {
          alert(loc.border.memory_failure);
        }
      }

      ReactNativeHapticFeedback.trigger('notificationSuccess', { ignoreAndroidSystemSettings: false });
      navigation.popToTop();
      navigation.goBack();
    } catch (e) {
      setIsLoading(false);
      alert(e.message);
      console.log('create border wallet error', e);
    }
  };

  function binarySearch(arr, el, compare_fn) {
    let m = 0;
    let n = arr.length - 1;
    while (m <= n) {
      const k = (n + m) >> 1; // eslint-disable-line no-bitwise
      const cmp = compare_fn(el, arr[k]);
      if (cmp > 0) {
        m = k + 1;
      } else if (cmp < 0) {
        n = k - 1;
      } else {
        return k;
      }
    }
    return ~m; // eslint-disable-line no-bitwise
  }

  if ((seedPhrase.length + 1) % 3 > 0) {
    throw new Error('Previous word list size must be multiple of three words, less one.');
  }

  const wordList = bip39.wordlists[bip39.getDefaultWordlist()];

  const concatLenBits = seedPhrase.length * 11;
  const concatBits = new Array(concatLenBits);
  let wordindex = 0;
  for (let i = 0; i < seedPhrase.length; i++) {
    const word = seedPhrase[i];
    const ndx = binarySearch(wordList, word, (el, test) => {
      return el === test ? 0 : el > test ? 1 : -1;
    });
    // Set the next 11 bits to the value of the index.
    for (let ii = 0; ii < 11; ++ii) {
      concatBits[wordindex * 11 + ii] = (ndx & (1 << (10 - ii))) !== 0; // eslint-disable-line no-bitwise
    }
    ++wordindex;
  }

  const checksumLengthBits = (concatLenBits + 11) / 33;
  const entropyLengthBits = concatLenBits + 11 - checksumLengthBits;
  const varyingLengthBits = entropyLengthBits - concatLenBits;

  const numPermutations = varyingLengthBits ** 2;
  const bitPermutations = new Array(numPermutations);

  for (let i = 0; i < numPermutations; i++) {
    if (bitPermutations[i] === undefined || bitPermutations[i] === null) bitPermutations[i] = new Array(varyingLengthBits);
    for (let j = 0; j < varyingLengthBits; j++) {
      bitPermutations[i][j] = ((i >> j) & 1) === 1; // eslint-disable-line no-bitwise
    }
  }

  const possibleWords = [];
  for (let i = 0; i < bitPermutations.length; i++) {
    const bitPermutation = bitPermutations[i];
    const entropyBits = new Array(concatLenBits + varyingLengthBits);
    entropyBits.splice(0, 0, ...concatBits);
    entropyBits.splice(concatBits.length, 0, ...bitPermutation.slice(0, varyingLengthBits));

    const entropy = new Array(entropyLengthBits / 8);
    for (let ii = 0; ii < entropy.length; ++ii) {
      for (let jj = 0; jj < 8; ++jj) {
        if (entropyBits[ii * 8 + jj]) {
          entropy[ii] |= 1 << (7 - jj); // eslint-disable-line no-bitwise
        }
      }
    }

    const hash = createHash('sha256').update(entropy).digest(); // TODO

    const hashBits = new Array(hash.length * 8);
    for (let iq = 0; iq < hash.length; ++iq) for (let jq = 0; jq < 8; ++jq) hashBits[iq * 8 + jq] = (hash[iq] & (1 << (7 - jq))) !== 0; // eslint-disable-line no-bitwise

    const wordBits = new Array(11);
    wordBits.splice(0, 0, ...bitPermutation.slice(0, varyingLengthBits));
    wordBits.splice(varyingLengthBits, 0, ...hashBits.slice(0, checksumLengthBits));

    let index = 0;
    for (let j = 0; j < 11; ++j) {
      index <<= 1; // eslint-disable-line no-bitwise
      if (wordBits[j]) {
        index |= 0x1; // eslint-disable-line no-bitwise
      }
    }

    possibleWords.push(wordList[index]);
  }

  let textBoxValue = '';

  const textChanged = text => {
    textBoxValue = text;
    if (possibleWords.indexOf(text) >= 0) {
      continueFooter.current.setEnabled(true);
    } else {
      continueFooter.current.setEnabled(false);
    }
  };

  const continueFooter = React.createRef();

  return (
    <View style={[styles.root, stylesHook.root]}>
      <View style={styles.wrapBox}>
        <BlueSpacing20 />
        <Text style={[styles.textdesc, stylesHook.textdesc]}>
          {loc.border.selected_words}
          <Text style={[styles.textdescBold, stylesHook.textdesc]}>{' ' + seedPhrase.join(' ')}</Text>
        </Text>
        <BlueSpacing20 />
        <BlueAutocomplete
          value=""
          style={[]}
          containerStyle={styles.flex}
          placeholder={loc.border.final_word}
          data={possibleWords}
          onChange={textChanged}
        />
        <BlueSpacing20 />
        {!importing ? (
          <BlueText
            style={styles.textStyle}
          >
            {loc.border.instructions_recap}
          </BlueText>
        ) : null}
        <BlueSpacing20 />
        <View style={styles.buttonBottom}>
          <ContinueFooter onContinue={onContinue} ref={continueFooter} importing={importing} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: {
	flex: 1,
  },
  root: {
    flex: 1,
    paddingHorizontal: 20,
  },
  wrapBox: {
    flexGrow: 1,
    flexBasis: 0,
    overflow: 'hidden',
  },
  buttonBottom: {
    flexGrow: 0,
    flexBasis: 'auto',
    marginBottom: 20,
    justifyContent: 'flex-end',
  },
  textStyle: {
    fontSize: 15,
  },
  textdesc: {
    fontWeight: '500',
    alignSelf: 'center',
    textAlign: 'center',
  },
  textdescBold: {
    fontWeight: '700',
    alignSelf: 'center',
    textAlign: 'center',
  },
});

class ContinueFooter extends Component {
  constructor(props) {
    super(props);
    this.state = { disable: true };
    this.setEnabled = this.setEnabled.bind(this);
  }

  setEnabled(sel) {
    this.setState({ disable: !sel });
  }

  render() {
    return (
      <BlueButton
        onPress={this.props.onContinue}
        title={this.props.importing ? loc.border.import : loc.border.create}
        disabled={this.state.disable}
      />
    );
  }
}

WalletsAddBorderFinalWord.navigationOptions = navigationStyle(
  {
    gestureEnabled: false,
    swipeEnabled: false,
    headerHideBackButton: true,
  },
  opts => ({ ...opts, title: loc.border.choose_final_word }),
);

export default WalletsAddBorderFinalWord;
