export CWD=$(pwd)
export DEPS_DIR=$CWD/deps
mkdir $CWD./deps
cd ./deps
git clone https://github.com/emscripten-core/emsdk --depth 1
#./emsdk install 3.1.56

git clone https://github.com/xkpesc/tvm --depth 1
git clone https://github.com/xkpesc/tokenizers-cpp --depth 1
git clone https://github.com/xkpesc/xgrammar --depth 1
git clone https://github.com/xkpesc/web-llm --depth 1


#TODO install emsdk

#build tvm/web
cd $DEPS_DIR/tvm
git submodule init
git submodule update
cd $DEPS_DIR/tvm/web
make -j$(nproc)


#build tokenizers-cpp (do we need rustc as well?)
cd $DEPS_DIR/tokenizers-cpp
git submodule init
git submodule update
npm install
npm run build

#build tokenizers-cpp (do we need rustc as well?)
cd $DEPS_DIR/xgrammar
#submodule init and update are already in package.json:scripts:prepare
npm install
npm run build

#TODO, change deps to github ones
#    "@mlc-ai/web-runtime": "github:xkpesc/tvm#path:/web",
#    "@mlc-ai/web-tokenizers": "github:xkpesc/tokenizers-cpp#path:/web",
#    "@mlc-ai/web-xgrammar": "github:xkpesc/xgrammar#path:/web",
