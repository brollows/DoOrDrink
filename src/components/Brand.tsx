import { Link } from 'react-router-dom';

export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="DoOrDrink, forsiden">
      <img className="brand-mark" src="/icon-192.png" alt="" width={41} height={41} />
      <span>Do<span className="brand-or">Or</span>Drink<span className="brand-dot">.</span></span>
    </Link>
  );
}
