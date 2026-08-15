---
description: 現セッションを畳み、次セッションが自動で読む handoff コメントを Issue に残す
allowed-tools: Bash(gh issue *), Bash(gh pr *), Bash(git *), Bash(date *), mcp__scheduled-tasks__create_scheduled_task
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
- リポジトリ全体の優先課題:
  - 次に着手すべき Issue: <Issue 番号 — なぜそれが優先かの一行理由>
  - 見送った候補: <候補 Issue 番号と見送った理由。候補がなければ「なし」>
  - 委譲済み・実行中のセッション: <対象 Issue と状況。なければ「なし」>
  - <リポジトリ全体の優先順位を判断していない場合は、この節全体を「未判断」とだけ書く>
```

4. コメント投稿が成功したら、常に後継セッションを 1 本だけ起こす。引数による出し分けはしない。

後継タスクを起こす前に `git rev-parse --show-toplevel` を実行してリポジトリの絶対パスを取得する。以下の後継プロンプト内の `<repo_path>` と `<repo_path>/AGENTS.md` は、その実行結果の実際の絶対パスへ置換してから埋め込む（プレースホルダを文字どおり残さない）。

まず `date "+%Y-%m-%dT%H:%M:%S%z"` で現在時刻を取り、そこから 2 分を加算して ISO 8601 の `fireAt` を作る。その値を使い、次の one-shot タスクを `create_scheduled_task` で作成する。

```text
create_scheduled_task({
  taskId: "handoff-<n>-resume",
  fireAt: "<現在時刻 + 2 分の ISO 8601>",
  description: "Issue #<n> の引き継ぎを読み、オーケストレーターとして再開する",
  prompt: """
あなたはオーケストレーター。タスク分解・委譲・進行管理・Issue/PR 運用・レビューを持つ。
最初に `gh issue view <n> --comments` で `<!-- handoff -->` の引き継ぎコメントを読み、そこから再開する。会話履歴は引き継がれない。
引き継ぎコメントに「リポジトリ全体の優先課題」節が存在する場合は、それを次の着手先の起点にする。`gh issue list` からの全体再評価をやり直さないこと。ただし、優先候補の Issue が既にクローズ済み、既に別セッションで着手済みなど前提が変わっている可能性があるため、着手前に対象 Issue の現状を確認すること。
作業対象のリポジトリは `<repo_path>`（実行時に `git rev-parse --show-toplevel` で取得した絶対パスへ置換済み）である。`<repo_path>/AGENTS.md`（同じ絶対パスのリポジトリ直下）を読むこと。
自分でコードを書かない。実装は二段委譲する — 実装タスクは `create_scheduled_task` で別セッションを起こし、そのセッションから `scripts/codex-run.sh <label> < prompt.txt` で Codex へ渡す。Codex が拒否・失敗したら回避策を探さず報告して止まる。
Issue を勝手にクローズしない。
"""
})
```

5. コメント URL を報告し、「このセッションはここで終了。続きは新しいセッションで」と伝えて止まる。
   後継セッションの `taskId` と発火時刻（`fireAt`）も報告し、次の 2 点を明記する。
   - アプリを閉じていると発火せず、次回起動時に走ること。
   - 現セッションは自動では閉じないので、畳むのは手動であること。
   実装や追加調査を続けない。

書くのは事実だけ。verify していないことを「完了」と書かない。
