import { expect } from "chai";
import {
  extractExpressionReferences,
  type ExpressionReferenceToken,
  type SystemFunctionToken,
  type VariableToken,
} from "../src/c3source.js";

describe("extractExpressionReferences", () => {
  it("extracts a bare object member reference with the correct span", () => {
    const expr = "Sprite.X";
    const tokens = extractExpressionReferences(expr);
    expect(tokens).to.have.length(1);
    const token = tokens[0] as ExpressionReferenceToken;
    expect(token.kind).to.equal("reference");
    expect(token.objectName).to.equal("Sprite");
    expect(token.memberName).to.equal("X");
    expect(token.behaviorName).to.be.undefined;
    expect(token.isCall).to.be.false;
    expect(token.start).to.equal(0);
    expect(token.end).to.equal(expr.length);
    expect(expr.slice(token.start, token.end)).to.equal("Sprite.X");
  });

  it("extracts an Object.Behavior.member reference", () => {
    const expr = "Player.Platform.VectorX";
    const tokens = extractExpressionReferences(expr);
    expect(tokens).to.have.length(1);
    const token = tokens[0] as ExpressionReferenceToken;
    expect(token.kind).to.equal("reference");
    expect(token.objectName).to.equal("Player");
    expect(token.behaviorName).to.equal("Platform");
    expect(token.memberName).to.equal("VectorX");
    expect(token.isCall).to.be.false;
    expect(expr.slice(token.start, token.end)).to.equal(expr);
  });

  it("distinguishes call form from bare property access", () => {
    const propToken = extractExpressionReferences("Sprite.PickedCount")[0] as ExpressionReferenceToken;
    expect(propToken.isCall).to.be.false;
    expect(propToken.objectName).to.equal("Sprite");
    expect(propToken.memberName).to.equal("PickedCount");

    const callToken = extractExpressionReferences("Array.At(0)")[0] as ExpressionReferenceToken;
    expect(callToken.isCall).to.be.true;
    expect(callToken.objectName).to.equal("Array");
    expect(callToken.memberName).to.equal("At");
  });

  it("produces no tokens for a Name.member sequence inside a string literal", () => {
    expect(extractExpressionReferences('"Sprite.X"')).to.have.length(0);
  });

  it("only extracts the bare reference in a mixed quoted/unquoted expression", () => {
    const tokens = extractExpressionReferences('"quoted Sprite.X" & Sprite.Y');
    expect(tokens).to.have.length(1);
    const token = tokens[0] as ExpressionReferenceToken;
    expect(token.objectName).to.equal("Sprite");
    expect(token.memberName).to.equal("Y");
  });

  it("handles the doubled-quote escape inside a string literal", () => {
    const tokens = extractExpressionReferences('"a ""b"" c" & Sprite.Y');
    expect(tokens).to.have.length(1);
    const token = tokens[0] as ExpressionReferenceToken;
    expect(token.objectName).to.equal("Sprite");
    expect(token.memberName).to.equal("Y");
  });

  it("flattens nested system-function calls with a local variable, in source order", () => {
    const tokens = extractExpressionReferences("int(random(Sprite.X)) + myLocalVar");
    expect(tokens).to.have.length(4);

    // Ascending start order.
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i].start).to.be.greaterThan(tokens[i - 1].start);
    }

    expect(tokens.filter((t) => t.kind === "reference")).to.have.length(1);
    expect(tokens.filter((t) => t.kind === "systemFunction")).to.have.length(2);
    expect(tokens.filter((t) => t.kind === "variable")).to.have.length(1);

    const [first, second, third, fourth] = tokens;
    expect((first as SystemFunctionToken).name).to.equal("int");
    expect((second as SystemFunctionToken).name).to.equal("random");
    expect((third as ExpressionReferenceToken).objectName).to.equal("Sprite");
    expect((third as ExpressionReferenceToken).memberName).to.equal("X");
    expect((fourth as VariableToken).name).to.equal("myLocalVar");
  });

  it("keeps both a system function and every reference across a concat expression, none dropped", () => {
    const tokens = extractExpressionReferences("int(Clock.Elapsed) & Player.Platform.VectorX");
    expect(tokens.filter((t) => t.kind === "systemFunction")).to.have.length(1);

    const references = tokens.filter((t) => t.kind === "reference") as ExpressionReferenceToken[];
    expect(references).to.have.length(2);
    expect(references[0].objectName).to.equal("Clock");
    expect(references[0].memberName).to.equal("Elapsed");
    expect(references[0].behaviorName).to.be.undefined;
    expect(references[1].objectName).to.equal("Player");
    expect(references[1].behaviorName).to.equal("Platform");
    expect(references[1].memberName).to.equal("VectorX");
  });

  it("never throws on malformed input and degrades to a partial/empty result", () => {
    expect(() => extractExpressionReferences("Sprite.")).to.not.throw();
    const trailingDot = extractExpressionReferences("Sprite.");
    // A trailing "." with no member following it is not a valid reference shape;
    // it degrades to a bare "variable" token for the identifier alone.
    expect(trailingDot).to.have.length(1);
    expect((trailingDot[0] as VariableToken).kind).to.equal("variable");
    expect((trailingDot[0] as VariableToken).name).to.equal("Sprite");

    expect(() => extractExpressionReferences("Array.At(0")).to.not.throw();
    const unbalanced = extractExpressionReferences("Array.At(0");
    expect(unbalanced).to.have.length(1);
    expect((unbalanced[0] as ExpressionReferenceToken).isCall).to.be.true;

    expect(() => extractExpressionReferences('"unterminated & Sprite.X')).to.not.throw();
    expect(extractExpressionReferences('"unterminated & Sprite.X')).to.have.length(0);

    expect(() => extractExpressionReferences("")).to.not.throw();
    expect(extractExpressionReferences("")).to.have.length(0);
  });

  it("links a call's argument to its parent and reports the call's argCount", () => {
    const tokens = extractExpressionReferences("Sprite.SetX(Player.X)");
    expect(tokens).to.have.length(2);
    const [setX, playerX] = tokens as ExpressionReferenceToken[];
    expect(setX.isCall).to.be.true;
    expect(setX.argCount).to.equal(1);
    expect(setX.parentIndex).to.be.undefined;
    expect(playerX.isCall).to.be.false;
    expect(playerX.argCount).to.be.undefined;
    expect(playerX.parentIndex).to.equal(0);
  });

  it("parents a reference inside a system-function call and leaves an unrelated reference unparented", () => {
    const tokens = extractExpressionReferences("int(Clock.Elapsed) & Player.Platform.VectorX");
    expect(tokens).to.have.length(3);
    const [intFn, clockElapsed, playerVectorX] = tokens as [
      SystemFunctionToken,
      ExpressionReferenceToken,
      ExpressionReferenceToken,
    ];
    expect(intFn.argCount).to.equal(1);
    expect(intFn.parentIndex).to.be.undefined;
    expect(clockElapsed.parentIndex).to.equal(0);
    expect(playerVectorX.parentIndex).to.be.undefined;
  });

  it("nests parentIndex/argCount correctly across nested system-function calls", () => {
    const tokens = extractExpressionReferences("int(random(Sprite.X))");
    expect(tokens).to.have.length(3);
    const [intFn, randomFn, spriteX] = tokens as [SystemFunctionToken, SystemFunctionToken, ExpressionReferenceToken];
    expect(intFn.argCount).to.equal(1);
    expect(intFn.parentIndex).to.be.undefined;
    expect(randomFn.argCount).to.equal(1);
    expect(randomFn.parentIndex).to.equal(0);
    expect(spriteX.parentIndex).to.equal(1);
  });

  it("counts multiple top-level arguments and parents every one to the call", () => {
    const tokens = extractExpressionReferences("max(Sprite.X, Sprite.Y, 3)");
    expect(tokens).to.have.length(3);
    const [maxFn, spriteX, spriteY] = tokens as [
      SystemFunctionToken,
      ExpressionReferenceToken,
      ExpressionReferenceToken,
    ];
    expect(maxFn.argCount).to.equal(3);
    expect(spriteX.parentIndex).to.equal(0);
    expect(spriteY.parentIndex).to.equal(0);
  });

  it("reports argCount 0 for a zero-argument call, for both call kinds", () => {
    const refTokens = extractExpressionReferences("Sprite.PickedCount()");
    expect(refTokens).to.have.length(1);
    const refToken = refTokens[0] as ExpressionReferenceToken;
    expect(refToken.isCall).to.be.true;
    expect(refToken.argCount).to.equal(0);

    const fnTokens = extractExpressionReferences("foo()");
    expect(fnTokens).to.have.length(1);
    expect((fnTokens[0] as SystemFunctionToken).argCount).to.equal(0);
  });

  it("leaves argCount undefined for a non-call reference and for a bare variable", () => {
    const propToken = extractExpressionReferences("Sprite.PickedCount")[0] as ExpressionReferenceToken;
    expect(propToken.isCall).to.be.false;
    expect(propToken.argCount).to.be.undefined;

    const varToken = extractExpressionReferences("myLocalVar")[0] as VariableToken;
    expect(varToken).to.not.have.property("argCount");
  });

  it("never throws on unbalanced parens and still gives the open call a best-effort argCount", () => {
    expect(() => extractExpressionReferences("int(Sprite.X")).to.not.throw();
    const tokens = extractExpressionReferences("int(Sprite.X");
    expect(tokens).to.have.length(2);
    const [intFn] = tokens as [SystemFunctionToken, ExpressionReferenceToken];
    expect(intFn.argCount).to.equal(1);
  });

  it("does not let commas nested in an inner call inflate the outer call's argCount", () => {
    const tokens = extractExpressionReferences("max(min(Sprite.X, Sprite.Y), 0)");
    expect(tokens).to.have.length(4);
    const [maxFn, minFn] = tokens as [
      SystemFunctionToken,
      SystemFunctionToken,
      ExpressionReferenceToken,
      ExpressionReferenceToken,
    ];
    expect(maxFn.argCount).to.equal(2);
    expect(minFn.argCount).to.equal(2);
    expect(minFn.parentIndex).to.equal(0);
  });
});
