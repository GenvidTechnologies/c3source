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
});
