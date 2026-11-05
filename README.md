# 暖暖分帳

無廣告的繁體中文分帳工具。奶油色與暖綠色、手機版面、群組帳本、夥伴、平均分攤、費用編輯與刪除、逐筆手動匯率、台幣結算、還款與撤銷還款、CSV 匯出。

## 使用狀態

未填連線設定時為**本機模式**，資料存在瀏覽器 localStorage，並非多人同步；請保留同一瀏覽器並定期匯出。LINE / Firebase 接通前不會假裝登入或同步成功。帳本預設空白，沒有虛構交易。

## GitHub Pages

Repository Settings → Pages → Deploy from a branch → main / (root)。入口為 index.html，不需建置。

## LINE 與 Firebase（待帳號登入後設定）

1. 在自己的 LINE Developers Provider 建立 LINE Login channel，加入 LIFF app，Endpoint URL 設為 `https://kkk6328.github.io/Split-Expenses/`，Size Full，Scopes `profile`、`openid`，啟用 share target picker 並由帳號持有人確認相關條款。LIFF ID 填入 config.js 的 liffId。不要使用 Light Split 的 LIFF ID。
2. Firebase 建立專案與 Firestore（正式模式）。後端使用 Cloud Functions；部署可能需要 Blaze 計費方案。計費與條款由帳號持有人確認，未取得確認前不啟用付費方案。
3. 在本機安裝官方 firebase-tools，執行 `firebase login`、`firebase use --add`。於 functions 目錄 `npm install`，回根目錄執行 `firebase deploy --only functions,firestore:rules`。
4. 部署時 LINE_CHANNEL_ID 填 LINE Login channel 的數字 ID，APP_ORIGIN 設 `https://kkk6328.github.io`。後端將 LINE ID token 送 LINE 官方 verify endpoint，驗證 channel 與登入身分；不信任前端傳來的 userId。Firestore 禁止瀏覽器直接讀寫。
5. 將部署回傳的 api URL 填入 config.js 的 apiBase，提交到 GitHub。config.js 僅有公開 LIFF ID 與 API URL，禁止放 Channel Secret / service-account key。
6. 由兩個不同 LINE 帳號驗證建立→邀請→加入→新增費用→重整同步。建立者可以產生 7 天有效的邀請連結；連結持有人可加入帳本並讀寫，請只私訊可信任的夥伴。每本最多 30 個登入帳號。

## 計算

每筆保存原幣金額、當時匯率（1 原幣 = 多少 TWD）、換算台幣分（四捨五入），不會以新匯率重算舊帳。分攤以台幣「分」為單位，餘數依所選夥伴順序分配，使總額完全一致。還款只記帳，不實際轉帳。輸出 CSV 對試算表公式字元做前綴處理。

## 共用與限制

所有加入帳本的 LINE 帳號均能編輯帳本全部內容；夥伴暱稱為分攤對象，與登入帳號不同。沒有自動讀取 LINE 群組成員、沒有自動發訊息機器人。邀請操作由使用者選擇分享對象或複製連結。資料在載入頁面時抓取，寫入用版本檢查避免覆蓋朋友更新；遇到衝突請重整。未實作自動背景同步、逐人權限與稽核歷史。Cloud Functions 需實際部署後才能進行整合測試。
