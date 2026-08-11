---
description: 現セッションを畳み、次セッションが自動で読む handoff コメントを Issue に残す
allowed-tools: Bash(gh issue *), Bash(gh pr *), Bash(git *)
---

セッションを畳む。会話履歴を持ち越さず、Issue コメントだけで次セッションが再開できる状態にする。

手順:

1. 対象 Issue 番号を決める。引数 `$ARGUMENTS` があればそれ。無ければ
   `git rev-parse --abbrev-ref HEAD` のブランチ名 (`fix/<n>-...` / `feat/<n>-...` / `issue-<n>`)
   から取る。どちらでも決まらない場合だけユーザーに聞く。
2. 未コミットの変更と未 push のコミットを確認する
   (`git status --porcelain`、`git log --oneline @{u}..` )。
3. 次のテンプレートで `gh issue comment <n> --body-file -` を実行する。
   1 行目の HTML コメントは次セッションの SessionStart hook が探すマーカーなので必須。

```markdown
<!-- handoff -->
## 引き継ぎ (YYYY-MM-DD)

- 原因 / 現状: <分かったこと。推測と実測を区別する>
- 変更対象: <ファイル:行、ブランチ、PR 番号>
- 検証: <実行したコマンドと結果。未実行なら未実行と書く>
- 未解決 / 次の一手: <次セッションが最初にやること>
```

4. コメント URL を報告し、「このセッションはここで終了。続きは新しいセッションで」と伝えて止まる。
   実装や追加調査を続けない。

書くのは事実だけ。verify していないことを「完了」と書かない。
