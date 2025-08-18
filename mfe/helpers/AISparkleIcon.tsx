import SvgIcon, { SvgIconProps } from '@material-ui/core/SvgIcon';
import React from 'react';

const AISparkleIcon: React.FC<SvgIconProps> = (props) => {
  return (
    <SvgIcon {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 13C7.625 12.4375 10.4375 9.625 11 4C11.5625 9.625 14.375 12.4375 20 13C14.375 13.5625 11.5625 16.375 11 22C10.4375 16.375 7.625 13.5625 2 13Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15 5.5C17.1875 5.28125 18.2812 4.1875 18.5 2C18.7188 4.1875 19.8125 5.28125 22 5.5C19.8125 5.71875 18.7188 6.8125 18.5 9C18.2812 6.8125 17.1875 5.71875 15 5.5Z"
      />
    </SvgIcon>
  );
};

export default AISparkleIcon;
